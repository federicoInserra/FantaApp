import {load} from 'cheerio';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const fail=()=>{throw new Error('Voti della giornata non disponibili o formato della fonte cambiato.');};
export const votesURL=(season,matchday)=>`https://www.fantacalcio.it/serie-a/voti/${season}-${String(season+1).slice(-2)}/${matchday}`;
const number=(v,min,max)=>{const s=clean(v);if(!/^-?\d+(?:[,.]\d+)?$/.test(s))return null;const n=Number(s.replace(',','.'));return n>=min&&n<=max?n:null;};
export function parseMatchdayVotes(html,season,matchday,{now=new Date()}={}) {
  const $=load(html);
  const selectedSeason=$('#season option[selected]').attr('value'),selectedDay=$('#matchweek option[selected]').attr('value');
  if(selectedSeason!==`${season}/${String(season+1).slice(-2)}`&&selectedSeason!==`${season}/${season+1}`)fail();
  if(Number(selectedDay)!==matchday||$('link[rel="canonical"]').attr('href')!==votesURL(season,matchday))fail();
  const matches=$('#match-menu li.match');
  if(matches.length!==10||matches.find('.match-pill[data-match-status]').length!==10)fail();
  const complete=matches.find('.match-pill[data-match-status="4"]').length===10;
  const players=[],clubs=[];
  $('.team-table').each((i,e)=>{
    const table=$(e),club=clean(table.find('thead .team-name meta[itemprop="name"]').attr('content'));
    if(!club||table.find('thead img[title="Redazione Fantacalcio"]').length!==2)fail();
    const providers=table.find('thead th .group img').map((j,img)=>$(img).attr('title')).get();
    if(providers[0]!=='Redazione Fantacalcio')fail();
    clubs.push(club);
    const rows=table.find('tbody tr');if(!rows.length||rows.length>40)fail();
    rows.each((j,e)=>{
      const row=$(e),link=row.find('a.player-name'),identity=/^https:\/\/www\.fantacalcio\.it\/serie-a\/squadre\/([a-z0-9-]+)\/[^/?#]+\/(\d+)$/.exec(link.attr('href')??'');
      const role=row.find('.role').attr('data-value')?.toUpperCase();
      if(role==='ALL')return; // The table also lists the coach; this app scores players only.
      if(link.length!==1||!identity||!['P','D','C','A'].includes(role))fail();
      const pill=row.find('.player-grade').first().parent();
      const rawVote=pill.find('.player-grade').attr('data-value'),rawFantasy=pill.find('.player-fanta-grade').attr('data-value');
      const vote=number(rawVote,0,10),fantasyVote=number(rawFantasy,-20,50);
      const conceded=number(row.find('.player-bonus[title="Gol subiti"]').attr('data-value'),0,30);
      // Public page CSS renders 55 as a placeholder 6 with no FV, and 56 as '-'.
      // Neither sentinel represents a scored vote. Never interpret 55 as 5.5 or 6.
      const noVote=['55','56','-','SV','S.V.','s.v.'].includes(rawVote)&&['55','56','-','SV','S.V.','s.v.'].includes(rawFantasy);
      const hasEvents=row.find('.player-bonus').toArray().some(e=>Number($(e).attr('data-value'))>0);
      const status=noVote&&!hasEvents?'unrated':vote!==null&&fantasyVote!==null&&conceded!==null?'rated':'unknown';
      players.push({id:identity[2],name:clean(link.text()),club,role,status,vote:status==='rated'?vote:null,fantasyVote:status==='rated'?fantasyVote:null,conceded});
    });
  });
  if(clubs.length>20||new Set(clubs).size!==clubs.length||players.length>800||new Set(players.map(p=>p.id)).size!==players.length)fail();
  // All finished fixtures and all twenty populated team tables are needed to infer no vote for absent players.
  return {version:1,provider:'Redazione Fantacalcio',season,matchday,sourceUrl:votesURL(season,matchday),retrievedAt:now.toISOString(),complete:complete&&clubs.length===20,clubs,players};
}
const cache=new Map();
export async function collectMatchdayVotes(season,matchday,{fetchImpl=fetch,now=new Date(),signal,useCache=true}={}) {
  const key=`${season}:${matchday}`,cached=cache.get(key);
  if(useCache&&cached&&now.getTime()-Date.parse(cached.retrievedAt)<300000)return cached;
  const timeout=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetchImpl(votesURL(season,matchday),{headers:{Accept:'text/html'},redirect:'error',signal:combined});
  if(!response.ok)fail();
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000)fail();parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const result=parseMatchdayVotes(Buffer.concat(parts).toString('utf8'),season,matchday,{now});
  if(useCache){if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,result);}
  return result;
}
