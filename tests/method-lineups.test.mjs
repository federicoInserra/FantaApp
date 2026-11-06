import test from 'node:test';
import assert from 'node:assert/strict';
import {MethodLineups,fetchMethodLineup,selectedLineupTeam,selectionKey} from '../src/method-lineups.mjs';
import {AI_MODELS} from '../src/ai-models.mjs';
import {renderFormationLayout} from '../src/formation-view.mjs';
import {renderPlayerAnalysis} from '../src/player-analysis.mjs';
import {renderFollowUp} from '../src/follow-up.mjs';
import {historyFixture} from './fixtures/history.mjs';
import {forecastFor} from './fixtures/lineup.mjs';
const kimi=AI_MODELS[1].id,deepseek=AI_MODELS[0].id;
const records=f=>['deepseek','kimi','statistical-engine'].map(method=>({method,record:{...structuredClone(f.record),recommendation:f.rec(method)}}));
const json=items=>Response.json({items});

test('method lookup queries the exact season and matchday and returns its own module, players and ordered bench',async()=>{
 const f=historyFixture(),items=records(f),rec=items[1].record.recommendation;
 rec.lineup.starters=rec.lineup.starters.map(id=>id==='A0'?'A3':id);rec.lineup.bench=rec.lineup.bench.map(id=>id==='A3'?'A0':id);
 rec.forecast=forecastFor(rec.lineup);
 const before=structuredClone(f.team);let url,options;
 const record=await fetchMethodLineup(f.team,kimi,'Giornata 8',{fetchImpl:async(u,o)=>{url=u;options=o;return json(items);}});
 assert.equal(url,`/api/lineups?teamId=${f.team.id}&season=2026&matchday=8`);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');
 assert.equal(record.recommendation.id,'kimi');const displayed=selectedLineupTeam(f.team,record);
 assert.deepEqual(displayed.recommendation.lineup,rec.lineup);assert.equal(displayed.formation,rec.lineup.formation);assert.deepEqual(f.team,before);
 const html=renderFormationLayout(displayed,'8',Date.parse('2026-10-01T12:00:00Z'),{saved:true});
 assert.match(html,/data-id="A3"/);assert.match(html,/<li data-player-id="A0"/);
});
test('missing method or unknown matchday produces no recommendation and a genuinely empty pitch',async()=>{
 const f=historyFixture();let calls=0;const fetchImpl=async()=>{calls++;return json(records(f).filter(i=>i.method!=='kimi'));};
 const record=await fetchMethodLineup(f.team,kimi,'8',{fetchImpl});assert.equal(record,null);
 const displayed=selectedLineupTeam(f.team,record),html=renderFormationLayout(displayed,'8',Date.now(),{empty:true,message:'Nessuna formazione salvata.'});
 assert.equal(displayed.recommendation,null);assert.doesNotMatch(html,/data-player-id=/);assert.equal([...html.matchAll(/pitch-empty/g)].length,11);assert.match(html,/CAMPO VUOTO/);assert.doesNotMatch(html,/Punteggio demo/);
 assert.equal(await fetchMethodLineup(f.team,kimi,'',{fetchImpl}),null);assert.equal(await fetchMethodLineup(f.team,kimi,'39',{fetchImpl}),null);assert.equal(calls,1);
});
test('returning to the same method re-queries the database and picks up a regenerated suggestion',async()=>{
 const f=historyFixture();let id='kimi-original',calls=0;const history=new MethodLineups(async()=>{calls++;const items=records(f);items[1].record.recommendation.id=id;return json(items);});
 await history.select(f.team,kimi,'8');assert.equal(history.current.record.recommendation.id,id);
 await history.select(f.team,deepseek,'8');assert.equal(history.current.record.recommendation.id,'deepseek');
 id='kimi-new';await history.select(f.team,kimi,'8');assert.equal(history.current.record.recommendation.id,'kimi-new');assert.equal(calls,3);
});
test('slow old selections cannot overwrite a newer method, team or matchday even when the transport ignores cancellation',async()=>{
 const f=historyFixture(),next=historyFixture({matchday:9});next.team.id='other-team';const pending=[];
 const history=new MethodLineups((url,options)=>new Promise(resolve=>pending.push({url,options,resolve})));let changes=0;
 const first=history.select(f.team,kimi,'8',()=>changes++);const second=history.select(next.team,deepseek,'9',()=>changes++);
 assert.equal(history.current.record,null);assert.equal(history.current.state,'loading');assert.equal(pending[0].options.signal.aborted,true);
 pending[1].resolve(json(records(next)));await second;const selected=history.current;
 pending[0].resolve(json(records(f)));await first;assert.equal(history.current,selected);assert.equal(selected.record.matchday,9);assert.equal(selected.record.recommendation.id,'deepseek');assert.equal(changes,3);
 assert.notEqual(selectionKey(f.team,kimi,'8'),selectionKey(next.team,kimi,'9'));
});
test('database failures clear the pitch, report failure and allow a successful retry without falling back to the latest method',async()=>{
 const f=historyFixture();let fail=true;const history=new MethodLineups(async()=>fail?new Response('',{status:503}):json(records(f)));
 await history.select(f.team,kimi,'8');assert.equal(history.current.state,'error');assert.equal(history.current.record,null);assert.match(history.current.error,/Riprova/);
 fail=false;await history.select(f.team,kimi,'8');assert.equal(history.current.state,'ready');assert.equal(history.current.record.recommendation.id,'kimi');
 const wrong=records(f);wrong[1].record.season=2025;await assert.rejects(fetchMethodLineup(f.team,kimi,'8',{fetchImpl:async()=>json(wrong)}),/giornata/);
});
test('an archived lineup remains exact after research expires or the live roster changes, with a warning and its own player reasons',()=>{
 const f=historyFixture(),record=records(f)[1].record;record.recommendation.forecast.players[0].reason='Kimi saved reason';
 f.team.players=f.team.players.filter(p=>p.id!=='D0');f.team.research.id='new-research';f.team.formation='3-4-3';
 const displayed=selectedLineupTeam(f.team,record),now=Date.parse('2026-10-10T12:00:00Z');
 const html=renderFormationLayout(displayed,'8',now,{saved:true});assert.match(html,/data-id="D0"/);assert.match(html,/4-3-3/);assert.match(html,/I dati attuali sono cambiati/);assert.doesNotMatch(html,/BOZZA INDICATIVA/);
 const player=renderPlayerAnalysis(displayed,record.recommendation.forecast.players[0].id,{fromPitch:true,saved:true,now});assert.match(player,/Kimi saved reason/);
 const followUp=renderFollowUp(displayed,{unavailableReason:'Questa proposta è archiviata.'});assert.match(followUp,/Chiedi a Kimi/);assert.match(followUp,/id="follow-up-question"[^>]*disabled/);assert.doesNotMatch(followUp,/Chiedi a DeepSeek/);
});
test('reading the latest archived suggestion keeps its live conversation without changing the database or archive',()=>{
 const f=historyFixture();f.team.recommendation.followUps=[{id:'reply',question:'Why?',answer:'Saved reply'}];
 const record=records(f)[0].record,displayed=selectedLineupTeam(f.team,record);
 assert.equal(displayed.recommendation.followUps[0].answer,'Saved reply');assert.equal(record.recommendation.followUps,undefined);
});
