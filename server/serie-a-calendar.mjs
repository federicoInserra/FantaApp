export const CALENDAR_URL='https://www.legaseriea.it/serie-a/calendario-risultati';
const API='https://seriea-api.prd.sdp.deltatre.digital/v1/serie-a/football/seasons/';
const fail=()=>{throw new Error('Calendario ufficiale Serie A non disponibile o non verificabile.');};
export function normalizeCalendar(data,now=new Date()){
  const season=Number(/^([0-9]{4})\/[0-9]{4}$/.exec(data?.competition?.seasonName)?.[1]);
  const expected=now.getUTCFullYear()-(now.getUTCMonth()<6?1:0);
  if(season!==expected||data?.competition?.name!=='Serie A'||!Array.isArray(data.matches)||data.matches.length>500)fail();
  const fixtures=data.matches.map(m=>({matchday:Number(/(?:Matchday|Giornata)\s+(\d+)/i.exec(m.matchSet?.name??'')?.[1]),home:m.home?.shortName,away:m.away?.shortName,kickoff:m.isUnknownKickOffTime?null:m.matchDateUtc,status:m.status}));
  if(!fixtures.length||fixtures.some(m=>!Number.isInteger(m.matchday)||m.matchday<1||m.matchday>38||typeof m.home!=='string'||typeof m.away!=='string'||typeof m.status!=='string'||m.kickoff!==null&&!Number.isFinite(Date.parse(m.kickoff))))fail();
  return {version:1,season,retrievedAt:now.toISOString(),fixtures};
}
async function download(url,fetchImpl,signal){
  const response=await fetchImpl(url,{signal,redirect:'error',headers:{Accept:'application/json, text/html'}});if(!response.ok)fail();
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000)fail();parts.push(Buffer.from(value));}}finally{await reader.cancel();}
  return Buffer.concat(parts).toString('utf8');
}
export async function collectCalendar({fetchImpl=fetch,now=new Date(),signal}={}){
  const timeout=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const page=await download(CALENDAR_URL,fetchImpl,combined);
  // Public widget configuration lists the current season first. Never execute page scripts.
  const seasonId=/seasonIds\\?"\s*:\s*\[\\?"(serie-a::Football_Season::[a-f0-9]{32})/.exec(page)?.[1];if(!seasonId)fail();
  const data=JSON.parse(await download(API+encodeURIComponent(seasonId)+'/matches',fetchImpl,combined));
  return normalizeCalendar(data,now);
}
let cached;
export async function handleCalendar(request,{fetchImpl=fetch,now=new Date(),cache=true}={}){
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}),url=new URL(request.url);
  if(request.method!=='GET')return json({error:'method'},405);
  if(url.search)return json({error:'parameters'},400);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'origin'},403);
  try{if(!cache||!cached||now-Date.parse(cached.retrievedAt)>300000){const data=await collectCalendar({fetchImpl,now,signal:request.signal});if(cache)cached=data;return json(data);}return json(cached);}catch{return json({error:'Calendario ufficiale Serie A non disponibile o non verificabile.'},502);}
}
