import {createHash} from 'node:crypto';
import {databaseStore} from './team-store.mjs';
import {providerRequest,callProvider} from './ai-proxy.mjs';
import {buildRequest,parseResponse} from '../src/analysis.mjs';
import {AI_MODELS,estimateUsage} from '../src/ai-models.mjs';
import {analysisFingerprint,withAnalysisResult} from '../src/analysis-state.mjs';
import {manualContextReason} from '../src/manual-lineup.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const uuid=v=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
export function publicJob(job){return job?{id:job.id,teamId:job.team_id,model:job.model,status:job.status,startedAt:new Date(job.created_at).toISOString(),expiresAt:new Date(job.expires_at).toISOString(),error:job.error??null}:null;}
export async function executeJob(job,{store,env=process.env,fetchImpl=fetch,timeoutMs=260000,logImpl=console.info}={}) {
  try {
    const team=job.snapshot,matchday=team.research.matchday;
    const body=buildRequest(team,matchday,'',new Date(job.created_at),team.research,job.model);
    // No browser Request.signal: the task is owned by the server until its deadline.
    const response=await callProvider(providerRequest('fireworks',body),{env,fetchImpl,timeoutMs,logImpl});
    if(!response.ok)throw Error(response.status===504?'Tempo massimo del modello raggiunto. Nessun nuovo tentativo automatico.':`Fireworks: richiesta non riuscita (HTTP ${response.status}). Nessun nuovo tentativo automatico.`);
    const data=await response.json(),result=parseResponse(data,team.research,team);
    const recommendation={version:2,id:job.id,...result,model:job.model,aiUsage:estimateUsage(job.model,data.usage),createdAt:new Date().toISOString(),teamFingerprint:analysisFingerprint(team),researchId:team.research.id,researchAt:team.research.completedAt,matchday};
    delete recommendation.usage;
    // Merge into the newest workspace revision. Unrelated edits are retained; a changed
    // roster/research or a newer recommendation must never be overwritten by this job.
    for(let attempt=0;attempt<3;attempt++) {
      const active=await store.getJob(job.team_id,job.id);if(active?.status!=='running')return;
      const current=await store.read(),live=current.state.teams.find(t=>t.id===job.team_id);
      if(!live||live.recommendation?.id!==team.recommendation?.id)throw Error('La proposta è cambiata durante l’analisi. Il nuovo risultato non è stato applicato.');
      const state=withAnalysisResult(current.state,job.team_id,'recommendation',recommendation,recommendation.teamFingerprint);
      if(await store.write({revision:current.revision,state,mutationId:`job-${job.id}`,jobId:job.id}))return;
    }
    throw Error('Salvataggio non riuscito per modifiche contemporanee. Nessun nuovo tentativo AI automatico.');
  } catch(error) {
    // Parser/context errors are safe to expose; upstream/database exceptions may contain secrets.
    const safe=/^(Fireworks:|Tempo massimo|La proposta è cambiata|La rosa o le regole|I dati della ricerca|La squadra non esiste|Salvataggio non riuscito|Formazione AI non valida|Spiegazione AI non valida|Analisi non completata|Risposta AI vuota|Il modello AI non ha restituito|Previsione)/.test(error.message)?error.message:'Analisi non riuscita. Il risultato precedente è conservato; nessun nuovo tentativo automatico.';
    try{await store.failJob(job.id,safe);}catch{/* A later status read expires an interrupted task. */}
  }
}
export async function handleAIJobs(request,{store,env=process.env,fetchImpl=fetch,waitUntil,timeoutMs,logImpl}={}) {
  const url=new URL(request.url);
  if(!['GET','POST'].includes(request.method))return json({error:'method'},405);
  if(request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&request.headers.get('origin')!==url.origin))return json({error:'origin'},403);
  const database=store??databaseStore(env);if(!database)return json({error:'not_configured'},503);
  try {
    if(request.method==='GET') {
      const teamId=url.searchParams.get('teamId'),id=url.searchParams.get('id');
      if(!teamId||teamId.length>150||(id&&!uuid(id)))return json({error:'invalid_request'},400);
      return json({job:publicJob(await database.getJob(teamId,id))});
    }
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'content_type'},415);
    const reader=request.body?.getReader();if(!reader)return json({error:'invalid_request'},400);
    let raw='';const decoder=new TextDecoder();let size=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>40000)return json({error:'size'},413);raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    let input;try{input=JSON.parse(raw);}catch{return json({error:'invalid_request'},400);}
    if(!uuid(input?.id)||typeof input.teamId!=='string'||input.teamId.length>150||!AI_MODELS.some(m=>m.id===input.model)||typeof input.matchday!=='string')return json({error:'invalid_request'},400);
    const current=await database.read(),team=current.state.teams.find(t=>t.id===input.teamId);
    if(!team)return json({error:'team_not_found'},404);
    if(input.researchId!==team.research?.id||input.teamFingerprint!==analysisFingerprint(team)||input.matchday!==team.research?.matchday)return json({error:'context_changed'},409);
    const reason=manualContextReason(team,input.matchday);if(reason)return json({error:reason},409);
    if(!team.players.length||(!team.listSource&&team.importedFrom!=='txt'))return json({error:'invalid_team'},400);
    if(!env.FIREWORKS_API_KEY?.trim())return json({error:'not_configured'},503);
    if(typeof waitUntil!=='function')return json({error:'background_unavailable'},503);
    const contextKey=createHash('sha256').update(JSON.stringify([team.id,input.model,input.matchday,input.researchId,input.teamFingerprint])).digest('hex');
    const {job,created}=await database.beginJob({id:input.id,teamId:team.id,model:input.model,contextKey,snapshot:team});
    if(!job)return json({error:'conflict'},409);
    if(job.id===input.id&&(job.team_id!==team.id||job.context_key!==contextKey))return json({error:'context_changed'},409);
    if(created){
      try{waitUntil(executeJob(job,{store:database,env,fetchImpl,timeoutMs,logImpl}));}
      catch{await database.failJob(job.id,'Servizio in background non disponibile. Riprova.');return json({error:'background_unavailable'},503);}
    }
    return json({job:publicJob(job)},created?202:200);
  }catch{return json({error:'database_unavailable'},502);}
}
