import {load} from 'cheerio';
import {seasonAt} from '../src/understat.mjs';
export const STATS_URL='https://www.fantacalcio.it/statistiche-serie-a';
export const LINEUPS_URL='https://www.fantacalcio.it/probabili-formazioni-serie-a';
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const fail=()=>{throw new Error('Source format changed');};
function identity(href) {
  const match=/^https:\/\/www\.fantacalcio\.it\/serie-a\/squadre\/([a-z0-9-]+)\/([^/?#]+)\/(\d+)$/.exec(href??'');
  return match?{id:match[3],club:match[1].replaceAll('-',' '),url:href}:null;
}
function number(value) {
  const text=clean(value); if(!text||text==='-'||text==='—')return null;
  if(!/^\d+(?:[,.]\d+)?$/.test(text))return fail();
  return Number(text.replace(',','.'));
}
export function parseStats(html,season) {
  const $=load(html),label=`${season}/${String(season+1).slice(-2)}`;
  if(!$('title').text().includes(label))fail();
  const headers=new Map($('thead [data-col-key]').map((i,e)=>[[$(e).attr('data-col-key'),clean($(e).text())]]).get());
  if(headers.get('pg')!=='PV'||headers.get('mv')!=='MV'||headers.get('mfv')!=='FM')fail();
  const rows=$('tr.player-row').map((i,e)=>{
    const row=$(e),link=row.find('a.player-link'),who=identity(link.attr('href'));
    if(!who||link.length!==1) return fail();
    const cell=key=>{const cells=row.find(`td[data-col-key="${key}"]`);if(cells.length!==1)fail();return clean(cells.text());};
    const stats=Object.fromEntries(Object.entries({rated:'pg',vote:'mv',fantamedia:'mfv',goals:'gol',conceded:'gs',penalties_saved:'rp',assists:'ass',yellow:'amm',red:'esp'}).map(([field,key])=>[field,number(cell(key))]));
    if(!Number.isInteger(stats.rated)||stats.rated>38)fail();
    // The source displays 0,0 for players without a vote. That is not a zero rating.
    if(stats.rated===0){stats.vote=null;stats.fantamedia=null;}
    const penalties=/^(\d+)\s*\/\s*(\d+)$/.exec(cell('rig'));if(!penalties)fail();
    stats.penalties_scored=Number(penalties[1]);stats.penalties_taken=Number(penalties[2]);
    if(stats.penalties_scored>stats.penalties_taken)fail();
    return {...who,name:clean(link.text()),role:row.attr('data-filter-role-classic')?.toUpperCase(),stats};
  }).get();
  if(!rows.length||rows.length>2000||new Set(rows.map(p=>p.id)).size!==rows.length)fail();
  return rows;
}
export function parseLineups(html,season) {
  const $=load(html),matches=[];
  $('li.match-item').each((i,e)=>{
    const block=$(e),url=block.find('a.match-score').first().attr('href');
    const match=/\/calendario\/(\d+)\/(\d{4})-(\d{2})\//.exec(url??'');
    if(!match||Number(match[2])!==season||Number(match[3])!==(season+1)%100)fail();
    const cards=block.find('.team-card');if(cards.length!==2)fail();
    const teams=cards.map((i,card)=>clean($(card).find('h3.team-name').text())).get();
    const updatedAt=clean(block.find('.last-update .date').text());
    const players=[];
    cards.each((side,card)=>{
      $(card).find('li.player-item').each((j,item)=>{
        const row=$(item),link=row.find('a.player-link'),who=identity(link.attr('href'));if(!who)fail();
        const probability=number(row.find('[aria-valuenow]').attr('aria-valuenow'));if(probability!==null&&probability>100)fail();
        players.push({...who,name:clean(link.text()),side,starting:row.parent().hasClass('starters')?'Probabile titolare':'Panchina prevista',probability,notes:[]});
      });
    });
    for(const [selector,label] of [['.injureds li','Infortunio'],['.suspendeds li','Squalifica'],['.dubts li','In dubbio']]){
      block.find(selector).each((j,item)=>{
        const row=$(item),link=row.find('a.player-link'),who=identity(link.attr('href'));if(!who)return;
        let player=players.find(p=>p.id===who.id);
        if(!player){player={...who,name:clean(link.text()),starting:null,probability:null,notes:[]};players.push(player);}
        player.notes.push(`${label}: ${clean(row.text())}`);
      });
    }
    if(new Set(players.map(p=>p.id)).size!==players.length)fail();
    matches.push({matchday:Number(match[1]),teams,updatedAt,url,players});
  });
  if(!matches.length||matches.length>10)fail();
  return matches;
}
async function download(url,fetchImpl,signal){
  const response=await fetchImpl(url,{headers:{Accept:'text/html'},redirect:'error',signal});
  if(!response.ok)throw new Error('Source unavailable');
  const reader=response.body.getReader();let size=0,parts=[];
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000)fail();parts.push(Buffer.from(value));}}finally{await reader.cancel();}
  return Buffer.concat(parts).toString('utf8');
}
export async function collectFantacalcio({fetchImpl=fetch,now=new Date(),signal}={}){
  const season=seasonAt(now),timeout=AbortSignal.timeout(20000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const results=await Promise.allSettled([download(STATS_URL,fetchImpl,combined).then(h=>parseStats(h,season)),download(LINEUPS_URL,fetchImpl,combined).then(h=>parseLineups(h,season))]);
  const warnings=[];
  if(results[0].status==='rejected')throw new Error('Statistiche Fantacalcio non disponibili o formato cambiato.');
  if(results[1].status==='rejected')warnings.push('Probabili formazioni non disponibili o formato cambiato: disponibilità e titolarità da verificare.');
  return {version:1,season,retrievedAt:now.toISOString(),players:results[0].value,matches:results[1].status==='fulfilled'?results[1].value:[],warnings};
}
let cached;
export async function handleFantacalcio(request,{fetchImpl=fetch,now=new Date(),cache=true}={}){
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  const url=new URL(request.url);
  if(request.method!=='GET')return json({error:'method'},405);
  if(url.search)return json({error:'parameters'},400);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'origin'},403);
  try{
    if(!cache||!cached||now.getTime()-Date.parse(cached.retrievedAt)>300000||cached.season!==seasonAt(now)){
      const data=await collectFantacalcio({fetchImpl,now,signal:request.signal});if(cache)cached=data;return json(data);
    }
    return json(cached);
  }catch{return json({error:'Fantacalcio unavailable or data format changed'},502);}
}
