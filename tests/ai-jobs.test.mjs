import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createTeamStore} from '../server/team-store.mjs';
import {handleAIJobs} from '../server/ai-jobs.mjs';
import {handleTeams} from '../server/teams-api.mjs';
import {analysisFingerprint} from '../src/analysis-state.mjs';
import {AI_MODELS} from '../src/ai-models.mjs';
import {AIJobs,elapsedLabel,jobProgress} from '../src/ai-jobs.mjs';
import {historyFixture} from './fixtures/history.mjs';
const env={FIREWORKS_API_KEY:'test-secret-never-expose'};
async function fixture(){
 const pg=new PGlite(),store=createTeamStore(async(strings,...values)=>{let sql=strings[0];values.forEach((v,i)=>sql+=`$${i+1}`+strings[i+1]);return(await pg.query(sql,values)).rows;});
 const f=historyFixture(),now=new Date();f.team.research.createdAt=now.toISOString();f.team.research.completedAt=now.toISOString();f.team.research.roundStartsAt=new Date(now.getTime()+43200000).toISOString();
 await store.write({revision:0,state:f.state,mutationId:'jobs-initial-fixture'});
 let release;const gate=new Promise(resolve=>release=resolve),tasks=[],calls=[];
 const data={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({...f.record.recommendation.lineup,forecast:f.record.recommendation.forecast,analysis:'Valid synthetic suggestion'})}]}],usage:{input_tokens:100,output_tokens:100}};
 const fetchImpl=async(url,options)=>{calls.push({url,options});await gate;options.signal.throwIfAborted();return Response.json(data);};
 const options={store,env,fetchImpl,waitUntil:task=>tasks.push(task),logImpl:()=>{}};
 const body=(id=randomUUID(),model=AI_MODELS[0].id)=>({id,teamId:f.team.id,model,matchday:'8',researchId:f.team.research.id,teamFingerprint:analysisFingerprint(f.team)});
 const post=(payload,signal)=>new Request('https://app.test/api/ai-jobs',{method:'POST',headers:{Origin:'https://app.test','Content-Type':'application/json'},body:JSON.stringify(payload),signal});
 const get=id=>new Request(`https://app.test/api/ai-jobs?teamId=${f.team.id}${id?`&id=${id}`:''}`);
 return {...f,pg,store,tasks,calls,release,data,options,body,post,get,close:()=>pg.close()};
}
test('accepted job survives client cancellation and atomically saves workspace, archive, cost and completed status',async()=>{
 const f=await fixture();try{
  const payload=f.body(),controller=new AbortController();const response=await handleAIJobs(f.post(payload,controller.signal),f.options);
  assert.equal(response.status,202);const job=(await response.json()).job;assert.equal(job.status,'running');assert.equal(f.tasks.length,1);assert.ok(!JSON.stringify(job).includes(env.FIREWORKS_API_KEY));assert.equal(job.snapshot,undefined);
  controller.abort();assert.equal(f.calls[0].options.signal.aborted,false);
  assert.equal((await f.store.read()).state.teams[0].recommendation.id,'deepseek');
  f.release();await Promise.all(f.tasks);
  const current=await f.store.read();assert.equal(current.state.teams[0].recommendation.id,payload.id);assert.ok(current.state.teams[0].recommendation.aiUsage.usd>0);
  const history=await f.store.history(f.team.id,2026,8);assert.equal(history.find(r=>r.method==='deepseek').recommendation_id,payload.id);
  const result=await (await handleAIJobs(f.get(payload.id),f.options)).json();assert.equal(result.job.status,'completed');assert.deepEqual((await f.store.getJob(f.team.id,payload.id)).snapshot,{});
 }finally{await f.close();}
});
test('simultaneous starts, different models and retries reuse one server job without another provider call',async()=>{
 const f=await fixture();try{
  const first=f.body(),second=f.body(randomUUID(),AI_MODELS[1].id);
  const responses=await Promise.all([handleAIJobs(f.post(first),f.options),handleAIJobs(f.post(second),f.options),handleAIJobs(f.post(first),f.options)]);
  const jobs=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(jobs.map(r=>r.job.id)).size,1);assert.equal(f.calls.length,1);assert.equal(f.tasks.length,1);
  const accepted=jobs[0].job.id,original=accepted===first.id?first:second;
  f.release();await Promise.all(f.tasks);
  const retry=await handleAIJobs(f.post(original),f.options);assert.equal(retry.status,200);assert.equal((await retry.json()).job.status,'completed');assert.equal(f.calls.length,1);
  const changed={...original,model:original.model===AI_MODELS[0].id?AI_MODELS[1].id:AI_MODELS[0].id};assert.equal((await handleAIJobs(f.post(changed),f.options)).status,409);
 }finally{await f.close();}
});
test('changed roster, research, deleted team or newer recommendation cannot be overwritten by an in-flight job',async()=>{
 for(const change of ['roster','research','deleted','recommendation']){
  const f=await fixture();try{
   const payload=f.body();await handleAIJobs(f.post(payload),f.options);
   const current=await f.store.read(),team=current.state.teams[0];
   if(change==='roster')team.players[1].available=false;
   if(change==='research')team.research.id='new-research';
   if(change==='deleted'){current.state.teams=[];current.state.activeTeamId=null;}
   if(change==='recommendation')team.recommendation=f.rec('kimi','newer-recommendation');
   await f.store.write({revision:current.revision,state:current.state,mutationId:`edit-${change}-fixture`});
   f.release();await Promise.all(f.tasks);assert.equal((await f.store.getJob(f.team.id,payload.id)).status,'failed');
   assert.notEqual((await f.store.read()).state.teams[0]?.recommendation.id,payload.id);assert.equal(f.calls.length,1);
  }finally{await f.close();}
 }
});
test('completion retries only database revision conflicts and preserves unrelated team edits',async()=>{
 const f=await fixture();try{
  let conflict=true;const original=f.store.write.bind(f.store);
  f.store.write=async input=>{if(input.jobId&&conflict){conflict=false;const current=await f.store.read();current.state.teams.push({id:'other-team',name:'Other team',formation:'4-3-3',players:[]});await original({revision:current.revision,state:current.state,mutationId:'unrelated-team-edit'});return null;}return original(input);};
  const payload=f.body();await handleAIJobs(f.post(payload),f.options);f.release();await Promise.all(f.tasks);
  const current=await f.store.read();assert.equal(current.state.teams.length,2);assert.equal(current.state.teams[0].recommendation.id,payload.id);assert.equal(f.calls.length,1);
 }finally{await f.close();}
});
test('invalid provider response, provider timeout and expired worker preserve previous choices and never regenerate',async()=>{
 for(const failure of ['invalid','timeout','expired']){
  const f=await fixture();try{
   if(failure==='invalid')f.data.output[0].content[0].text='not JSON';
   if(failure==='timeout')f.options.fetchImpl=async(url,{signal})=>{f.calls.push({url});await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});setTimeout(resolve,30);});signal.throwIfAborted();};
   const payload=f.body();await handleAIJobs(f.post(payload),{...f.options,timeoutMs:5});
   if(failure==='expired')await f.store.expireJobs(new Date(Date.now()+301000));
   f.release();await Promise.all(f.tasks);const job=await f.store.getJob(f.team.id,payload.id);assert.equal(job.status,'failed');assert.equal((await f.store.read()).state.teams[0].recommendation.id,'deepseek');assert.equal(f.calls.length,1);
  }finally{await f.close();}
 }
});
test('job endpoint rejects cross-site requests, arbitrary models, stale context and unavailable background runtime before billing',async()=>{
 const f=await fixture();try{
  const payload=f.body();const cases=[new Request('https://app.test/api/ai-jobs',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify(payload)}),f.post({...payload,model:'arbitrary'}),f.post({...payload,researchId:'old'}),f.post({...payload,teamFingerprint:'wrong'})];
  for(const request of cases)assert.ok((await handleAIJobs(request,f.options)).status>=400);
  assert.equal((await handleAIJobs(f.post(payload),{...f.options,waitUntil:undefined})).status,503);assert.equal(f.calls.length,0);
 }finally{f.release();await f.close();}
});
const job=(status='running')=>({id:'aabbccdd-1234-1234-1234-123456789012',teamId:'team',model:AI_MODELS[0].id,status,startedAt:'2026-10-10T12:00:00Z',expiresAt:'2026-10-10T12:05:00Z',error:null});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('client pauses network checks while hidden, restores persisted job after reopening and retrieves completion without a POST',async()=>{
 const storage=memory(),calls=[],updates=[];let visible=true,status='running';
 const fetchImpl=async(url,options)=>{calls.push(options.method);return Response.json({job:options.method==='POST'||url.includes('&id=')?job(status):null});};
 const client=new AIJobs({storage,fetchImpl,uuid:()=>job().id,visible:()=>visible,schedule:()=>1,onChange:u=>updates.push(u.job?.status)});
 await client.start({teamId:'team',model:AI_MODELS[0].id,matchday:'8',researchId:'r',teamFingerprint:'f'});assert.equal(calls.filter(m=>m==='POST').length,1);
 visible=false;const count=calls.length;await client.wake();assert.equal(calls.length,count);
 status='completed';visible=true;const reopened=new AIJobs({storage,fetchImpl,schedule:()=>1,onChange:u=>updates.push(u.job?.status)});await reopened.resume('team');assert.equal(updates.at(-1),'completed');assert.equal(calls.filter(m=>m==='POST').length,1);assert.equal(reopened.remembered('team'),null);
});
test('a lost start response is recovered by job ID instead of submitting another paid request',async()=>{
 let submitted=0,accepted=false;const client=new AIJobs({storage:memory(),schedule:()=>1,uuid:()=>job().id,fetchImpl:async(url,options)=>{
  if(options.method==='POST'){submitted++;accepted=true;throw Error('connection lost after acceptance');}
  return Response.json({job:accepted?job():null});
 }});
 await client.start({teamId:'team',model:AI_MODELS[0].id});assert.equal(submitted,1);assert.ok(client.remembered('team'));
 await client.start({teamId:'team',model:AI_MODELS[0].id});assert.equal(submitted,1);assert.equal(client.entries.get('team').job.status,'running');
});
test('timer uses wall-clock elapsed time and loading remains indeterminate',()=>{
 assert.equal(elapsedLabel('2026-10-10T12:00:00Z',Date.parse('2026-10-10T12:02:09Z')),'2:09');assert.equal(elapsedLabel('2026-10-10T12:00:00Z',0),'0:00');
 const html=jobProgress(job(),Date.parse('2026-10-10T12:01:00Z'));assert.match(html,/1:00/);assert.match(html,/<progress aria-label=/);assert.doesNotMatch(html,/value=|%/);assert.match(html,/Puoi bloccare il telefono/);
});
test('overlapping mount, start and wake checks cannot clear or duplicate a starting job',async()=>{
 let resolveStart,submitted=0;const gate=new Promise(resolve=>resolveStart=resolve);
 const client=new AIJobs({storage:memory(),schedule:()=>1,uuid:()=>job().id,fetchImpl:async(url,options)=>{
  if(options.method==='POST'){submitted++;await gate;return Response.json({job:job()});}
  return Response.json({job:null});
 }});
 const first=client.start({teamId:'team',model:AI_MODELS[0].id});
 // Let the initial active-job discovery finish and the POST start.
 await new Promise(resolve=>setImmediate(resolve));
 await Promise.all([client.resume('team'),client.wake(),client.start({teamId:'team',model:AI_MODELS[0].id})]);
 resolveStart();await first;assert.equal(submitted,1);assert.equal(client.entries.get('team').tracking,true);assert.equal(client.entries.get('team').job.status,'running');
});
test('interrupted workers cannot write after the job lease expires, even if their snapshot is still valid',async()=>{
 const f=await fixture();try{
  const payload=f.body();await handleAIJobs(f.post(payload),f.options);
  const current=await f.store.read();
  await f.store.expireJobs(new Date(Date.now()+301000));
  current.state.teams[0].name='Must not commit';
  assert.equal(await f.store.write({revision:current.revision,state:current.state,mutationId:'expired-job-attempt',jobId:payload.id}),null);
  assert.equal((await f.store.read()).state.teams[0].name,f.team.name);
  f.release();await Promise.all(f.tasks);
 }finally{await f.close();}
});
test('an archive constraint failure rolls back the workspace and completed status together',async()=>{
 const f=await fixture();try{
  await f.pg.exec("ALTER TABLE fantaapp_lineup_history ADD CONSTRAINT job_archive_guard CHECK (recommendation_id='deepseek')");
  const payload=f.body();await handleAIJobs(f.post(payload),f.options);f.release();await Promise.all(f.tasks);
  assert.equal((await f.store.read()).state.teams[0].recommendation.id,'deepseek');assert.equal((await f.store.getJob(f.team.id,payload.id)).status,'failed');assert.equal((await f.store.history(f.team.id,2026,8))[0].recommendation_id,'deepseek');
 }finally{await f.close();}
});
test('a lost database acknowledgement after atomic completion does not mark the saved job failed',async()=>{
 const f=await fixture();try{
  const write=f.store.write.bind(f.store);f.store.write=async input=>{const result=await write(input);if(input.jobId)throw Error('database response lost');return result;};
  const payload=f.body();await handleAIJobs(f.post(payload),f.options);f.release();await Promise.all(f.tasks);
  assert.equal((await f.store.getJob(f.team.id,payload.id)).status,'completed');assert.equal((await f.store.read()).state.teams[0].recommendation.id,payload.id);assert.equal(f.calls.length,1);
 }finally{await f.close();}
});
test('an already-completed start acknowledgement is published as terminal, not left waiting',async()=>{
 const updates=[];const client=new AIJobs({storage:memory(),schedule:()=>1,uuid:()=>job().id,onChange:u=>updates.push({status:u.job?.status,starting:u.starting,tracking:u.tracking}),fetchImpl:async(url,options)=>Response.json({job:options.method==='POST'?job('completed'):null})});
 await client.start({teamId:'team',model:AI_MODELS[0].id});assert.deepEqual(updates.at(-1),{status:'completed',starting:false,tracking:false});assert.equal(client.remembered('team'),null);
});
test('browser workspace saves cannot supply the internal job-completion capability',async()=>{
 const f=await fixture();try{
  const payload=f.body();await handleAIJobs(f.post(payload),f.options);const current=await f.store.read();
  const request=new Request('https://app.test/api/teams',{method:'PUT',headers:{Origin:'https://app.test','Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,state:current.state,mutationId:'browser-job-spoof-test',jobId:payload.id})});
  assert.equal((await handleTeams(request,{store:f.store})).status,200);assert.equal((await f.store.getJob(f.team.id,payload.id)).status,'running');
  f.release();await Promise.all(f.tasks);assert.equal((await f.store.getJob(f.team.id,payload.id)).status,'completed');
 }finally{await f.close();}
});
