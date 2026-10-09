import {databaseStore} from './team-store.mjs';
import {collectMatchdayVotes} from './matchday-votes.mjs';
import {actualLineupScore} from './actual-lineup-score.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=150;
const validRound=(season,matchday)=>Number.isInteger(season)&&season>=2000&&season<=2200&&Number.isInteger(matchday)&&matchday>=1&&matchday<=38;
export async function handleLineups(request,{store,env=process.env,collect=collectMatchdayVotes,now=new Date()}={}) {
  if(!['GET','POST'].includes(request.method))return json({error:'Metodo non supportato.'},405);
  const url=new URL(request.url);
  if((request.method==='POST'||request.headers.has('origin'))&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine non consentita.'},403);
  let teamId,season,matchday;
  try {
    if(request.method==='GET') {
      if([...url.searchParams.keys()].some(k=>!['teamId','season','matchday'].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))throw Error();
      teamId=url.searchParams.get('teamId');
      if(url.searchParams.has('season')||url.searchParams.has('matchday')){season=Number(url.searchParams.get('season'));matchday=Number(url.searchParams.get('matchday'));if(!validRound(season,matchday))throw Error();}
    }else {
      if(url.search)throw Error();
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Formato richiesta non valido.'},415);
      const reader=request.body.getReader(),parts=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096)throw Error();parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      ({teamId,season,matchday}=JSON.parse(Buffer.concat(parts).toString('utf8')));
      if(!validRound(season,matchday))throw Error();
    }
    if(!validId(teamId))throw Error();
  }catch{return json({error:'Squadra o giornata non valida.'},400);}
  try {
    const database=store??databaseStore(env);if(!database)return json({error:'Database non configurato.'},503);
    const workspace=await database.read();
    if(!workspace.state.teams.some(t=>t.id===teamId))return json({error:'Squadra non trovata.'},404);
    if(request.method==='GET')return json({items:await database.history(teamId,season,matchday)});
    const items=await database.history(teamId,season,matchday);
    if(!items.length)return json({items:[]});
    // Before kickoff there are no actual results to collect.
    if(items.every(item=>item.record.roundStartsAt&&Date.parse(item.record.roundStartsAt)>now.getTime()))return json({items,notice:'La giornata non è ancora iniziata.'});
    let votes;
    try{votes=await collect(season,matchday,{now,signal:request.signal});}catch{return json({error:'Voti della giornata non disponibili o formato della fonte cambiato. I risultati salvati sono conservati.'},502);}
    for(const item of items)await database.score(teamId,season,matchday,item.method,item.recommendation_id,actualLineupScore(item.record,votes));
    return json({items:await database.history(teamId,season,matchday)});
  }catch{return json({error:'Database o calcolo dei risultati non disponibile.'},502);}
}
