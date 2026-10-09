import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createTeamStore} from '../server/team-store.mjs';
import {cloudState} from '../src/cloud-state.mjs';
import {withAnalysisResult,analysisFingerprint,storedResearch} from '../src/analysis-state.mjs';
import {handleLineups} from '../server/lineups-api.mjs';
import {historyFixture} from './fixtures/history.mjs';
let mutations=0;
async function database() {
  const pg=new PGlite();const store=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>text+=`$${i+1}`+strings[i+1]);return (await pg.query(text,values)).rows;});
  const save=async(state,revision)=>store.write({state:cloudState(state),revision:revision??(await store.read()).revision,mutationId:`history-mutation-${++mutations}`});
  return {pg,store,save};
}
const req=(body,origin='https://app.test')=>new Request('https://app.test/api/lineups',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('archives three methods, overwrites only the same season/day/method and retains immutable roster/rules',async()=>{
  const {pg,store,save}=await database(),f=historyFixture();
  try{
    await save(f.state);
    for(const method of ['kimi','statistical-engine']){const state=(await store.read()).state;await save(withAnalysisResult(state,f.team.id,'recommendation',f.rec(method),analysisFingerprint(state.teams[0])));}
    let history=await store.history(f.team.id,2026,8);assert.equal(history.length,3);
    await store.score(f.team.id,2026,8,'deepseek','deepseek',{checkedAt:'2026-10-03T12:00:00Z',status:'complete',total:80});
    await store.score(f.team.id,2026,8,'kimi','kimi',{checkedAt:'2026-10-03T12:00:00Z',status:'complete',total:70});
    let state=(await store.read()).state;await save(withAnalysisResult(state,f.team.id,'recommendation',f.rec('deepseek','deepseek-again'),analysisFingerprint(state.teams[0])));
    history=await store.history(f.team.id,2026,8);assert.equal(history.length,3);assert.equal(history.find(i=>i.method==='deepseek').actual_result,null);assert.equal(history.find(i=>i.method==='kimi').actual_result.total,70);
    state=(await store.read()).state;state.teams[0].players[0].name='Changed';state.teams[0].rules[4]='Massimo 2 sostituzioni per giornata.';await save(state);
    assert.equal((await store.history(f.team.id,2026,8))[0].record.players[0].name,f.record.players[0].name);assert.equal((await store.history(f.team.id,2026,8))[0].record.rules[4],f.record.rules[4]);
    const day9=historyFixture({matchday:9});await save(day9.state);assert.equal((await store.history(f.team.id)).length,4);
    const nextSeason=historyFixture({season:2027});await save(nextSeason.state);assert.equal((await store.history(f.team.id)).length,5);
    await save({teams:[],activeTeamId:null});assert.equal((await store.history(f.team.id)).length,0);
  }finally{await pg.close();}
});
test('revision conflicts and archive failures cannot partially commit either workspace or history',async()=>{
  const {pg,store,save}=await database(),f=historyFixture();try{
    await save(f.state);const revision=(await store.read()).revision;
    const a=structuredClone(f.state),b=structuredClone(f.state);a.teams[0].recommendation=f.rec('kimi');b.teams[0].recommendation=f.rec('statistical-engine');
    const results=await Promise.all([save(a,revision),save(b,revision)]);assert.equal(results.filter(Boolean).length,1);assert.equal((await store.history(f.team.id)).length,2);
    await pg.exec(`CREATE FUNCTION reject_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive failed'; END; $$; CREATE TRIGGER reject_archive BEFORE INSERT ON fantaapp_lineup_history FOR EACH ROW EXECUTE FUNCTION reject_archive();`);
    const before=await store.read();const c=structuredClone(before.state);c.teams[0].recommendation=f.rec('deepseek','replacement');await assert.rejects(save(c),/archive failed/);
    assert.deepEqual(await store.read(),before);assert.equal((await store.history(f.team.id)).length,2);
  }finally{await pg.close();}
});
test('in-flight scoring cannot attach to a regenerated recommendation and old results cannot replace newer checks',async()=>{
  const {pg,store,save}=await database(),f=historyFixture();try{
    await save(f.state);await store.score(f.team.id,2026,8,'deepseek','deepseek',{checkedAt:'2026-10-03T12:00:00Z',status:'complete',total:80});
    assert.equal(await store.score(f.team.id,2026,8,'deepseek','deepseek',{checkedAt:'2026-10-02T12:00:00Z',status:'pending'}),false);
    f.team.recommendation=f.rec('deepseek','new');await save(f.state);
    assert.equal(await store.score(f.team.id,2026,8,'deepseek','deepseek',{checkedAt:'2026-10-04T12:00:00Z',status:'complete',total:90}),false);
    assert.equal((await store.history(f.team.id,2026,8))[0].actual_result,null);
  }finally{await pg.close();}
});
test('follow-ups and ordinary saves do not clear scores or rewrite the archived formation',async()=>{
  const {pg,store,save}=await database(),f=historyFixture();try{
    await save(f.state);await store.score(f.team.id,2026,8,'deepseek','deepseek',{checkedAt:'2026-10-03T12:00:00Z',status:'complete',total:80});
    let state=(await store.read()).state;state.teams[0].recommendation.followUps=[{id:'follow-up',createdAt:'2026-10-01T13:00:00Z',question:'Why?',answer:'Test answer'}];await save(state);
    const history=await store.history(f.team.id,2026,8);assert.equal(history[0].actual_result.total,80);assert.equal(history[0].record.recommendation.followUps,undefined);
    const summaries=await store.history(f.team.id);assert.equal(summaries[0].total,80);assert.equal(summaries[0].record,undefined);
  }finally{await pg.close();}
});
test('migrates the latest compatible legacy suggestion without overwriting existing history',async()=>{
  const {pg,store}=await database(),f=historyFixture();try{
    await store.read();await pg.query('UPDATE fantaapp_workspace SET state=$1::jsonb',[JSON.stringify(cloudState(f.state))]);
    const reopened=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>text+=`$${i+1}`+strings[i+1]);return(await pg.query(text,values)).rows;});
    await reopened.read();assert.equal((await reopened.history(f.team.id)).length,1);
    f.team.recommendation=f.rec('deepseek','older-replacement');await pg.query('UPDATE fantaapp_workspace SET state=$1::jsonb',[JSON.stringify(cloudState(f.state))]);
    const again=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>text+=`$${i+1}`+strings[i+1]);return(await pg.query(text,values)).rows;});
    await again.read();assert.equal((await again.history(f.team.id,2026,8))[0].recommendation_id,'deepseek');
  }finally{await pg.close();}
});
test('history API validates access and automatically saves actual results without client-provided scores',async()=>{
  const {pg,store,save}=await database(),f=historyFixture();try{
    await save(f.state);const body={teamId:f.team.id,season:2026,matchday:8};let calls=0;
    const collect=async()=>{calls++;return f.votes;};const options={store,collect,now:new Date('2026-10-03T12:00:00Z')};
    assert.equal((await handleLineups(req(body,'https://evil.test'),options)).status,403);
    assert.equal((await handleLineups(req({...body,matchday:39}),options)).status,400);
    assert.equal((await handleLineups(new Request(`https://app.test/api/lineups?teamId=${f.team.id}&season=2026`),options)).status,400);
    assert.equal((await handleLineups(req({...body,teamId:'missing'}),options)).status,404);
    const before=await handleLineups(req(body),{...options,now:new Date('2026-10-01T12:00:00Z')});assert.equal((await before.json()).notice,'La giornata non è ancora iniziata.');assert.equal(calls,0);
    const response=await handleLineups(req({...body,total:999}),options);assert.equal(response.status,200);const item=(await response.json()).items[0];assert.equal(item.actual_result.total,68);assert.equal(calls,1);
    const failure=await handleLineups(req(body),{...options,collect:()=>{throw Error('secret');}});assert.equal(failure.status,502);assert.equal((await store.history(f.team.id,2026,8))[0].actual_result.total,68);
  }finally{await pg.close();}
});
test('research provider identities survive sanitation and malformed identities are rejected',()=>{
  const f=historyFixture();assert.equal(storedResearch(f.team.research).players[0].fantacalcioId,'1');
  f.team.research.players[0].fantacalcioId='https://evil.test';assert.throws(()=>storedResearch(f.team.research));
});
