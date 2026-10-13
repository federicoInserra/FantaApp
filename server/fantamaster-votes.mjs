import {collectCalendar} from './serie-a-calendar.mjs';
export const FANTAMASTER_PLAYERS_URL='https://apicdn.fantamaster.it/playersstats/';
export const FANTAMASTER_LIVE_URL='https://publicapi.fantamaster.it/livescores/';
export const fantamasterVotesURL=matchday=>`https://publicapi.fantamaster.it/ratings/?day=${matchday}`;
const fail=()=>{throw Error('Voti FantaMaster non disponibili o stagione/giornata non verificabile.');};
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=150;
const numeric=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const id=v=>Number.isSafeInteger(v)&&v>0;
const events=['goal','penalty','assist','spenalty','mpenalty','owngoal','gotgoal','ycard','rcard'];
const canonical=v=>String(v).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const club=v=>({'acmilan':'milan','hellasverona':'verona','parmacalcio1913':'parma'}[canonical(v)]??canonical(v));
export function parseFantamasterVotes(ratings,roster,live,calendar,season,matchday,{now=new Date()}={}) {
  if(!Number.isInteger(season)||!Number.isInteger(matchday)||matchday<1||matchday>38||ratings?.day!==matchday||!Number.isInteger(ratings.maxday)||ratings.maxday<matchday||ratings.maxday>38||!Array.isArray(ratings.ratings)||ratings.ratings.length>800||!Array.isArray(roster?.players)||!roster.players.length||roster.players.length>1000)fail();
  // The ratings endpoint has no season field. Anchor it to its own current
  // fixture feed's dates, and verify the requested round against the official calendar.
  if(Number(live?.day)!==ratings.maxday||!Array.isArray(live.scores)||live.scores.length!==10||calendar?.season!==season||!Array.isArray(calendar.fixtures))fail();
  for(const game of live.scores){
    const date=/^(\d{4})-(\d{2})-\d{2} \d{2}:\d{2}$/.exec(game.rawdate??'');
    if(!date||!Number.isFinite(Date.parse(game.rawdate.replace(' ','T')+':00Z'))||Number(date[1])-(Number(date[2])<7?1:0)!==season)fail();
  }
  const fixtures=calendar.fixtures.filter(f=>f.matchday===matchday),expectedClubs=fixtures.flatMap(f=>[club(f.home),club(f.away)]);
  if(fixtures.length!==10||new Set(expectedClubs).size!==20)fail();
  const finished=fixtures.every(f=>f.status==='FINISHED'&&Number.isFinite(Date.parse(f.kickoff))&&Date.parse(f.kickoff)<=now.getTime());
  const players=new Map();
  for(const p of roster.players){
    if(!id(p.id)||!text(p.name)||!text(p.team)||!['P','D','C','A'].includes(p.role)||players.has(String(p.id)))fail();
    // Full player list distinguishes a known nonparticipant from an unresolved identity.
    players.set(String(p.id),{id:String(p.id),name:p.name,club:p.team,role:p.role,status:'unrated',vote:null,fantasyVote:null,conceded:0});
  }
  const seen=new Set(),ratedClubs=new Set();
  for(const p of ratings.ratings){
    if(!id(p.id)||!text(p.name)||!text(p.team)||!['P','D','C','A'].includes(p.role)||seen.has(p.id)||!expectedClubs.includes(club(p.team))||!numeric(p.mark,0,10)||!numeric(p.fmark,-20,50)||events.some(k=>!Number.isInteger(p[k])||p[k]<0||p[k]>30))fail();
    seen.add(p.id);
    const status=p.mark>0?'rated':p.fmark===0&&events.every(k=>p[k]===0)?'unrated':'unknown';
    if(status==='rated')ratedClubs.add(club(p.team));
    players.set(String(p.id),{id:String(p.id),name:p.name,club:p.team,role:p.role,status,vote:status==='rated'?p.mark:null,fantasyVote:status==='rated'?p.fmark:null,conceded:p.gotgoal});
  }
  // Only finalized current-round editorial ratings are accepted, never live estimates.
  const published=matchday<ratings.maxday||live.scores.every(g=>g.time==='FT'&&g.voting==='F');
  return {version:1,provider:'FantaMaster',identity:'fantamaster',season,matchday,sourceUrl:fantamasterVotesURL(matchday),retrievedAt:now.toISOString(),complete:finished&&published&&ratedClubs.size===20,clubs:expectedClubs,players:[...players.values()]};
}
async function downloadJSON(url,fetchImpl,signal){
  const response=await fetchImpl(url,{headers:{Accept:'application/json'},redirect:'error',signal});if(!response.ok)fail();
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)fail();parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail();}
}
const cache=new Map();
export async function collectFantamasterVotes(season,matchday,{fetchImpl=fetch,now=new Date(),signal,useCache=true,calendarCollector=collectCalendar}={}){
  const key=`${season}:${matchday}`,cached=cache.get(key);
  if(useCache&&cached&&now.getTime()-Date.parse(cached.retrievedAt)>=0&&now.getTime()-Date.parse(cached.retrievedAt)<300000)return cached;
  const timeout=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const results=await Promise.allSettled([
    downloadJSON(fantamasterVotesURL(matchday),fetchImpl,combined),
    downloadJSON(FANTAMASTER_PLAYERS_URL,fetchImpl,combined),
    downloadJSON(FANTAMASTER_LIVE_URL,fetchImpl,combined),
    calendarCollector({fetchImpl,now,signal:combined})
  ]);
  if(results.some(r=>r.status!=='fulfilled'))fail();
  const result=parseFantamasterVotes(...results.map(r=>r.value),season,matchday,{now});
  if(useCache){if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,result);}
  return result;
}
