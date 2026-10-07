import { normalizeLeague, seasonAt } from '../src/understat.mjs';
const DEFAULT_ORIGINS = 'https://federicoinserra.github.io';
export async function handleRequest(request, env={}, {fetchImpl=fetch,cache,now=new Date()}={}) {
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS).split(',').map(s=>s.trim());
  const cors={Vary:'Origin','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
  if(origin && !allowed.includes(origin)) return Response.json({error:'Origin not allowed'},{status:403,headers:cors});
  if(origin) cors['Access-Control-Allow-Origin']=origin;
  if(url.pathname!=='/api/understat') return Response.json({error:'Not found'},{status:404,headers:cors});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if(request.method!=='GET') return Response.json({error:'Method not allowed'},{status:405,headers:{...cors,Allow:'GET, OPTIONS'}});
  const seasonText=url.searchParams.get('season');
  if(!/^\d{4}$/.test(seasonText??'') || [...url.searchParams.keys()].some(k=>k!=='season') || url.searchParams.getAll('season').length!==1) return Response.json({error:'Invalid season'},{status:400,headers:cors});
  const season=Number(seasonText);
  if(season<2014 || season>seasonAt(now)) return Response.json({error:'Invalid season'},{status:400,headers:cors});
  const cacheKey=new Request(`${url.origin}/api/understat?season=${season}`);
  try {
    let response=await cache?.match(cacheKey);
    if(!response){
      // Same public endpoint/header used by Understat's own league page. Never forward client headers or URLs.
      const upstream=await fetchImpl(`https://understat.com/getLeagueData/Serie_A/${season}`,{headers:{'X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!upstream.ok) throw new Error('Upstream unavailable');
      const text=await upstream.text();if(text.length>5_000_000)throw new Error('Response too large');
      const raw=JSON.parse(text);normalizeLeague(raw,season,now);
      // Strip unrelated provider fields before returning the public dataset.
      const pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o[k]]));
      const data={players:raw.players.map(p=>pick(p,['id','player_name','team_title','games','time','xG','npxG','xA','shots'])),teams:Object.fromEntries(Object.entries(raw.teams).map(([key,t])=>[key,{...pick(t,['id','title']),history:t.history.map(h=>pick(h,['date','h_a','xG','xGA']))}])),dates:raw.dates.map(m=>pick(m,['id','h','a','datetime','isResult']))};
      response=Response.json({season,retrievedAt:now.toISOString(),data},{headers:{'Cache-Control':'public, max-age=300'}});
      try { await cache?.put(cacheKey,response.clone()); } catch { /* Cache is optional, never a data dependency. */ }
    }
    const result=new Response(response.body,response);for(const [key,value] of Object.entries(cors))result.headers.set(key,value);return result;
  } catch { return Response.json({error:'Understat unavailable or data format changed. Retry later.'},{status:502,headers:{...cors,'Cache-Control':'no-store'}}); }
}
export default {fetch(request,env){return handleRequest(request,env,{cache:globalThis.caches?.default});}};
