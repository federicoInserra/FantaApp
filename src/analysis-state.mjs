import {ENGINE_ID,storedEngineMetadata,engineDeadlinePassed} from './statistical-engine.mjs';
import {modelInfo,storedAIUsage} from './ai-models.mjs';
import {teamRules} from './rules.mjs';
import {validateExtraction,staleReason} from './research.mjs';
import {validUnderstatSnapshot} from './understat.mjs';
import {storedLineup,validateLineup,suggestLineup} from './lineup.mjs';
import {storedForecast,forecastTotals} from './forecast.mjs';
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const text=(v,max)=>typeof v==='string'&&v.length<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const fail=()=>{throw new Error('Risultati della ricerca o della formazione non validi.');};
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const list=(v,max)=>Array.isArray(v)&&v.length<=max;
export const MAX_FOLLOW_UPS=10;
export function storedFollowUp(data){
  if(!text(data?.id,100)||!data.id||!date(data.createdAt)||!text(data.question,2000)||!data.question.trim()||!text(data.answer,8000)||!data.answer.trim())fail();
  return {...pick(data,['id','createdAt','question','answer']),...aiMetadata(data)};
}
export function analysisFingerprint(team){return JSON.stringify([team.name,team.listSource,teamRules(team),team.players.map(p=>[p.id,p.name,p.club,p.role,p.available])]);}
function sourceMetadata(source){
  if(!text(source?.id,30)||!source.id||!url(source.url)||!text(source.url,1000)||!text(source.title,250))fail();
  return pick(source,['id','url','title']);
}
function compactUnderstat(data){
  if(!validUnderstatSnapshot(data))fail();
  const result=pick(data,['version','provider','league','season','retrievedAt','latestMatchAt','sourceUrl']);
  const summary=o=>pick(o,['games','xg','xga','xgPerMatch','xgaPerMatch']);
  result.players=data.players.map(p=>({...pick(p,['rosterId','name','teamId','reason']),player:p.player?pick(p.player,['id','name','clubs','teamIds','games','minutes','xg','npxg','xa','shots','xgPer90','npxgPer90','xaPer90']):null}));
  result.teams=data.teams.map(t=>({...pick(t,['id','name','lastMatchAt']),overall:summary(t.overall),home:summary(t.home),away:summary(t.away)}));
  result.fixtures=data.fixtures.map(f=>pick(f,['id','homeId','awayId','kickoff','completed']));
  return result;
}
export function storedResearch(data){
  if(data?.version!==2||!text(data.id,100)||!data.id||!date(data.createdAt)||!date(data.completedAt)||!text(data.signature,25000)||!text(data.matchday,120)||!list(data.players,40)||!list(data.sources,150)||!list(data.warnings,200)||!data.warnings.every(w=>text(w,2000)))fail();
  const sources=data.sources.map(s=>{if(!text(s.text,50000)||!date(s.retrievedAt))fail();return {...sourceMetadata(s),text:s.text,retrievedAt:s.retrievedAt};});
  if(new Set(sources.map(s=>s.id)).size!==sources.length)fail();
  if(!data.players.every(p=>text(p.id,150)&&text(p.name,200)&&text(p.club,150)&&list(p.observations,40)))fail();
  if(new Set(data.players.map(p=>p.id)).size!==data.players.length)fail();
  const players=validateExtraction(data,data.players,sources).map((player,i)=>{
    const id=data.players[i].fantacalcioId;
    if(id!==undefined&&(typeof id!=='string'||!/^\d{1,12}$/.test(id)))fail();
    return {...player,...(id!==undefined?{fantacalcioId:id}:{})};
  });
  // Reject invalid evidence rather than silently presenting a changed saved result.
  if(players.some((p,i)=>p.observations.length!==data.players[i].observations.length))fail();
  if(data.roundStartsAt!==undefined&&!date(data.roundStartsAt))fail();
  const result={...pick(data,['version','id','createdAt','completedAt','signature','matchday','roundStartsAt']),understat:compactUnderstat(data.understat),players,sources,warnings:[...data.warnings],credits:0};
  if(JSON.stringify(result).length>250000)throw new Error('La ricerca è troppo grande per essere salvata.');
  return structuredClone(result);
}
function aiMetadata(data){
  if(data.model!==undefined)modelInfo(data.model);
  return {...(data.model!==undefined?{model:data.model}:{}),...(data.aiUsage!==undefined?{aiUsage:storedAIUsage(data.aiUsage)}:{})};
}
export function storedRecommendation(data){
  if(![1,2].includes(data?.version)||!text(data.id,100)||!data.id||!date(data.createdAt)||!date(data.researchAt)||!text(data.researchId,100)||!data.researchId||!text(data.teamFingerprint,30000)||!text(data.matchday,120)||!text(data.text,80000)||!data.text.trim()||!list(data.sources,150))fail();
  if(data.method!==undefined&&data.method!==ENGINE_ID)fail();
  if(data.method===ENGINE_ID&&(data.version!==2||data.forecast===undefined||data.model!==undefined||data.aiUsage!==undefined||data.followUps?.length))fail();
  const engine=data.method===ENGINE_ID?storedEngineMetadata(data.engine):null;
  const lineup=data.version===2?storedLineup(data.lineup):null;
  const forecast=lineup&&data.forecast!==undefined?storedForecast(data.forecast,lineup,{preservePrecision:Boolean(engine)}):null;
  if(engine&&(Math.abs(engine.expected-forecastTotals(forecast).expected)>1e-9||Math.abs(forecast.low-Math.round(engine.p10*10)/10)>1e-9||Math.abs(forecast.high-Math.round(engine.p90*10)/10)>1e-9))fail();
  if(data.followUps!==undefined&&!list(data.followUps,MAX_FOLLOW_UPS))fail();
  const followUps=data.followUps?.map(storedFollowUp);
  if(followUps&&new Set(followUps.map(item=>item.id)).size!==followUps.length)fail();
  return structuredClone({...pick(data,['version','id','createdAt','researchId','researchAt','teamFingerprint','matchday','text']),...(engine?{method:ENGINE_ID,engine}:aiMetadata(data)),...(lineup?{lineup,...(forecast?{forecast}:{})}:{}),...(followUps?{followUps}:{}),sources:data.sources.map(sourceMetadata)});
}
export function recommendationIsStale(recommendation,team,research,matchday,now=Date.now()){
  return (recommendation.method===ENGINE_ID&&engineDeadlinePassed(research,now))||!research||recommendation.researchId!==research.id||recommendation.teamFingerprint!==analysisFingerprint(team)||recommendation.matchday!==matchday;
}
export function formationView(team,matchday=team.research?.matchday??'',now=Date.now()){
  const rec=team.recommendation;
  let reason='';
  if(rec){
    if(recommendationIsStale(rec,team,team.research,matchday,now)||staleReason(team.research,team,matchday,now))reason=rec.method===ENGINE_ID?'La proposta Statistical engine è superata. Generane una nuova con dati aggiornati.':'La proposta AI è superata. Generane una nuova con dati aggiornati.';
    else if(!rec.lineup)reason='La proposta precedente contiene solo testo. Generane una nuova per visualizzarla sul campo.';
    else if(team.formation!==rec.lineup.formation)reason=rec.method===ENGINE_ID?'Hai scelto un modulo diverso dalla proposta Statistical engine. Il campo mostra una bozza indicativa.':'Hai scelto un modulo diverso dalla proposta AI. Il campo mostra una bozza indicativa.';
    else{
      try{return {...validateLineup(rec.lineup,team.players),ai:true,reason:''};}
      catch{reason='La formazione salvata non corrisponde alla rosa. Genera una nuova proposta.';}
    }
  }
  return {...suggestLineup(team.players,team.formation),formation:team.formation,bench:[],ai:false,reason};
}
// Update only this team's latest result; existing recommendation stays visible after new research.
export function withAnalysisResult(state,teamId,kind,result,expectedFingerprint){
  const next=structuredClone(state),team=next.teams.find(t=>t.id===teamId);
  if(!team)throw new Error('La squadra non esiste più. Il risultato non è stato salvato.');
  if(analysisFingerprint(team)!==expectedFingerprint)throw new Error('La rosa o le regole sono cambiate durante la richiesta. Ripeti la ricerca o l’analisi.');
  if(kind==='research')team.research=storedResearch(result);
  else if(kind==='recommendation'){
    const recommendation=storedRecommendation(result);
    if(recommendation.researchId!==team.research?.id)throw new Error('I dati della ricerca sono cambiati. Ripeti l’analisi.');
    if(recommendation.teamFingerprint!==expectedFingerprint)fail();
    if(recommendation.lineup){
      validateLineup(recommendation.lineup,team.players);
      team.formation=recommendation.lineup.formation;
    }
    team.recommendation=recommendation;
  }else if(kind==='followUp'){
    const rec=team.recommendation;
    if(!rec||rec.id!==result.recommendationId||recommendationIsStale(rec,team,team.research,result.matchday))throw new Error('La proposta o i dati sono cambiati. Riapri la formazione prima di fare altre domande.');
    const history=rec.followUps??[];
    if((history.at(-1)?.id??null)!==result.previousFollowUpId)throw new Error('La conversazione è cambiata. Ricarica la squadra prima di riprovare.');
    const followUp=storedFollowUp(result);
    team.recommendation=storedRecommendation({...rec,followUps:[...history,followUp].slice(-MAX_FOLLOW_UPS)});
  }else fail();
  return next;
}
