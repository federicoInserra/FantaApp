import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createManualDraft,changeManualFormation,selectManualPlayer,manualPlayerChoices,manualLineup,manualContextReason,copyRecommendationPrompt,buildManualRecommendation} from '../src/manual-lineup.mjs';
import {storedRecommendation,withAnalysisResult,analysisFingerprint} from '../src/analysis-state.mjs';
import {buildRequest} from '../src/analysis.mjs';
import {AI_MODELS} from '../src/ai-models.mjs';
import {recommendationMethod,recommendationLabel} from '../src/recommendation-methods.mjs';
import {renderManualFormation} from '../src/manual-lineup-ui.mjs';
import {renderFormationLayout} from '../src/formation-view.mjs';
import {recommendationView} from '../src/analysis-presentation.mjs';
import {renderFollowUp,buildFollowUpRequest} from '../src/follow-up.mjs';
import {renderComparisonCards,COMPARISON_METHODS} from '../src/comparison-ui.mjs';
import {createTeamStore} from '../server/team-store.mjs';
import {handleLineups} from '../server/lineups-api.mjs';
import {cloudState} from '../src/cloud-state.mjs';
import {historyFixture} from './fixtures/history.mjs';
const now=new Date('2026-10-01T12:00:00Z');
const slot=(section,role,index)=>({section,role,index});
const fixture=()=>historyFixture();
const draftFor=f=>createManualDraft(f.team,f.record.recommendation.lineup);
test('manual editor starts empty, renders eleven role-filtered slots and validates a deliberate lineup',()=>{
 const f=fixture(),draft=createManualDraft(f.team);assert.equal(Object.values(draft.starters).flat().filter(Boolean).length,0);
 assert.throws(()=>manualLineup(draft,f.team),/Completa/);
 const html=renderManualFormation(f.team,draft,{method:'federico'});assert.equal([...html.matchAll(/data-section="starters"/g)].length,11);assert.match(html,/Salva formazione Federico/);assert.match(html,/id="manual-save"[^>]*disabled/);
 assert.deepEqual(manualLineup(draftFor(f),f.team),f.record.recommendation.lineup);
});
test('only available players of the selected role can be chosen; an assigned player swaps without duplicates',()=>{
 const f=fixture(),before=structuredClone(f.team);let draft=draftFor(f);
 assert.equal(manualPlayerChoices(f.team,draft,'D').length,8);assert.ok(manualPlayerChoices(f.team,draft,'D').every(c=>c.player.role==='D'));
 draft=selectManualPlayer(draft,f.team,slot('starters','D',0),'D4');assert.equal(draft.starters.D[0],'D4');assert.equal(draft.bench.D[0],'D0');
 draft=selectManualPlayer(draft,f.team,slot('bench','D',1),'D0');assert.equal(draft.bench.D[1],'D0');assert.equal(draft.bench.D[0],'D5');
 const lineup=manualLineup(draft,f.team);assert.equal(new Set([...lineup.starters,...lineup.bench]).size,25);assert.deepEqual(f.team,before);
 assert.throws(()=>selectManualPlayer(draft,f.team,slot('starters','D',0),'A0'),/stesso ruolo/);
 assert.throws(()=>selectManualPlayer(draft,f.team,slot('starters','D',99),'D0'),/Posizione/);
 f.team.players.find(p=>p.id==='D7').available=false;assert.ok(!manualPlayerChoices(f.team,draft,'D').some(c=>c.player.id==='D7'));assert.throws(()=>selectManualPlayer(draft,f.team,slot('starters','D',0),'D7'));
});
test('formation changes preserve choices and bench priority, moving overflow to bench and promoting first reserves',()=>{
 const f=fixture(),draft=draftFor(f),original=structuredClone(draft);
 const changed=changeManualFormation(draft,f.team,'3-4-3');assert.deepEqual(changed.starters.D,['D0','D1','D2']);assert.deepEqual(changed.bench.D,['D3','D4','D5','D6','D7']);assert.deepEqual(changed.starters.C,['C0','C1','C2','C3']);assert.equal(changed.bench.C[0],'C4');
 assert.deepEqual(manualLineup(changeManualFormation(changed,f.team,'4-3-3'),f.team),manualLineup(draft,f.team));assert.deepEqual(draft,original);assert.throws(()=>changeManualFormation(draft,f.team,'4-6-0'));
});
test('empty bench slots are omitted, invalid starters are rejected and incomplete rosters retain explicit missing slots',()=>{
 const f=fixture();let draft=draftFor(f);draft=selectManualPlayer(draft,f.team,slot('bench','P',0),null);
 assert.ok(!manualLineup(draft,f.team).bench.includes('P1'));draft=selectManualPlayer(draft,f.team,slot('starters','P',0),null);assert.throws(()=>manualLineup(draft,f.team));
 f.team.players=f.team.players.filter(p=>p.role!=='A');draft=createManualDraft(f.team);for(const role of ['P','D','C'])for(let i=0;i<draft.starters[role].length;i++)draft=selectManualPlayer(draft,f.team,slot('starters',role,i),`${role}${i}`);
 assert.equal(manualLineup(draft,f.team).starters.length,8);
});
test('ChatGPT copy uses the exact instructions and input generated for both existing models, without network calls',()=>{
 const f=fixture(),prompt=copyRecommendationPrompt(f.team,'8',now);
 for(const model of AI_MODELS){const request=buildRequest(f.team,'8','',now,f.team.research,model.id);assert.equal(prompt.text,request.instructions+'\n\n'+request.input);}
 assert.equal(prompt.researchId,f.team.research.id);assert.equal(prompt.teamFingerprint,analysisFingerprint(f.team));assert.ok(prompt.text.includes('Understat'));assert.ok(prompt.text.includes('regolamento'));
 assert.ok(manualContextReason(f.team,'8',now.getTime()+7*3600000));assert.throws(()=>copyRecommendationPrompt(f.team,'9',now));
});
test('manual records preserve attribution and notes, carry no fabricated forecast/cost and block stale copied prompts',()=>{
 const f=fixture(),draft=draftFor(f);draft.notes='My deliberate choice.';
 for(const method of ['federico','chatgpt']){
  const rec=buildManualRecommendation({team:f.team,method,draft,now,id:method});const saved=storedRecommendation({...rec,apiKey:'never store'});
  assert.equal(saved.method,method);assert.equal(saved.notes,draft.notes);assert.equal(recommendationMethod(saved),method);assert.equal(saved.forecast,undefined);assert.equal(saved.model,undefined);assert.equal(saved.aiUsage,undefined);assert.ok(!JSON.stringify(saved).includes('never store'));
  const display=recommendationView(saved,false);assert.match(display,new RegExp(recommendationLabel(saved)));assert.match(display,/Manuale/);assert.doesNotMatch(display,/Token non disponibili/);
  assert.equal(renderFollowUp({...f.team,recommendation:saved}),'');assert.throws(()=>buildFollowUpRequest({team:{...f.team,recommendation:saved},question:'Why?'}),/manualmente/);
  assert.throws(()=>storedRecommendation({...rec,model:AI_MODELS[0].id}));assert.throws(()=>storedRecommendation({...rec,forecast:f.record.recommendation.forecast}));assert.throws(()=>storedRecommendation({...rec,notes:'x'.repeat(5001)}));
 }
 const prompt=copyRecommendationPrompt(f.team,'8',now),rec=buildManualRecommendation({team:f.team,method:'chatgpt',draft,prompt,now:new Date(now.getTime()+1000),id:'copied'});assert.equal(storedRecommendation(rec).promptCopiedAt,now.toISOString());
 assert.throws(()=>storedRecommendation({...rec,promptCopiedAt:'2026-10-02T12:00:00Z'}));
 f.team.research.id='new-research';assert.throws(()=>buildManualRecommendation({team:f.team,method:'chatgpt',draft,prompt,now}),/dopo la copia/);
});
test('manual modes share the guarded saving path and render saved choices without claiming an AI forecast',()=>{
 const f=fixture(),draft=draftFor(f),rec=buildManualRecommendation({team:f.team,method:'federico',draft,now,id:'federico'});
 const state=withAnalysisResult(f.state,f.team.id,'recommendation',rec,analysisFingerprint(f.team));assert.deepEqual(state.teams[0].recommendation.lineup,manualLineup(draft,f.team));
 const html=renderFormationLayout(state.teams[0],'8',now.getTime());assert.match(html,/SCELTA MANUALE/);assert.match(html,/Federico/);assert.doesNotMatch(html,/Genera una nuova proposta per aggiungere/);assert.doesNotMatch(html,/PROPOSTA AI/);
 assert.throws(()=>withAnalysisResult(state,f.team.id,'followUp',{},{...rec}.teamFingerprint),/manuali/);
 const changed=structuredClone(state);changed.teams[0].players[0].available=false;assert.throws(()=>withAnalysisResult(changed,f.team.id,'recommendation',rec,rec.teamFingerprint),/cambiate/);
});
test('manual UI safely escapes roster names and notes and preserves role-specific empty bench slots',()=>{
 const f=fixture();f.team.players[0].name='<script>x</script>';const draft=draftFor(f);draft.notes='</textarea><script>x</script>';
 const html=renderManualFormation(f.team,draft,{method:'chatgpt'});assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.match(html,/Panchina ChatGPT modificabile/);assert.match(html,/data-role="D"/);
});
test('all five methods persist independently, score together and manual regeneration overwrites only its own entry',async()=>{
 const pg=new PGlite(),f=fixture();let revision=0;
 const store=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>text+=`$${i+1}`+strings[i+1]);return(await pg.query(text,values)).rows;});
 const save=async state=>store.write({revision:revision++,state:cloudState(state),mutationId:`manual-mutation-${revision}`});
 try{
  await save(f.state);
  for(const method of ['kimi','statistical-engine','chatgpt','federico']){
   const current=(await store.read()).state,team=current.teams[0];let rec;
   if(['chatgpt','federico'].includes(method)){let draft=draftFor(f);if(method==='federico')draft=selectManualPlayer(draft,f.team,slot('starters','A',0),'A3');rec=buildManualRecommendation({team,method,draft,now,id:method});}
   else rec=f.rec(method);
   await save(withAnalysisResult(current,f.team.id,'recommendation',rec,analysisFingerprint(team)));
  }
  let history=await store.history(f.team.id,2026,8);assert.equal(history.length,5);assert.equal(history.find(i=>i.method==='federico').record.recommendation.lineup.starters.at(-3),'A3');
  const request=new Request('https://app.test/api/lineups',{method:'POST',headers:{Origin:'https://app.test','Content-Type':'application/json'},body:JSON.stringify({teamId:f.team.id,season:2026,matchday:8})});
  const response=await handleLineups(request,{store,collect:async()=>f.votes,now:new Date('2026-10-03T12:00:00Z')});assert.equal(response.status,200);history=(await response.json()).items;assert.ok(history.every(i=>i.actual_result.status==='complete'));
  const comparison=renderComparisonCards(history);assert.equal(COMPARISON_METHODS.length,5);assert.match(comparison,/ChatGPT/);assert.match(comparison,/Federico/);assert.ok(history.find(i=>i.method==='chatgpt').actual_result.total>0);
  const current=(await store.read()).state,team=current.teams[0];const rec=buildManualRecommendation({team,method:'federico',draft:draftFor(f),now,id:'federico-new'});
  await save(withAnalysisResult(current,f.team.id,'recommendation',rec,analysisFingerprint(team)));
  history=await store.history(f.team.id,2026,8);assert.equal(history.length,5);assert.equal(history.find(i=>i.method==='federico').actual_result,null);assert.equal(history.find(i=>i.method==='chatgpt').actual_result.status,'complete');assert.equal(history.find(i=>i.method==='deepseek').recommendation_id,'deepseek');
 }finally{await pg.close();}
});
