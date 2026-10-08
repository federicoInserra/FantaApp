import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createTeamStore} from '../server/team-store.mjs';
import {handleTeams} from '../server/teams-api.mjs';
import {DatabaseTeams} from '../src/cloud-sync.mjs';
import {analysisFingerprint,withAnalysisResult,storedResearch,storedRecommendation,recommendationIsStale} from '../src/analysis-state.mjs';
import {squadSignature} from '../src/research.mjs';
import {normalizeLeague,understatSnapshot} from '../src/understat.mjs';
import {rawLeague,now} from './fixtures/understat.mjs';
const team={id:'team-one',name:'Team',formation:'4-3-3',listSource:'leghe',players:[{id:'p1',name:'Player',club:'Inter',role:'A',form:null,vote:null}]};
const state=()=>({teams:[structuredClone(team)],activeTeamId:team.id});
function research(id='research-one',date=now.toISOString()){
 const quote='Player (Inter) · 2026/2027 · vote: 6';
 return {version:2,id,createdAt:date,completedAt:date,signature:squadSignature(team),matchday:'6',understat:understatSnapshot(normalizeLeague(rawLeague(),2026,now),team.players,now),players:[{id:'p1',name:'Player',club:'Inter',observations:[{field:'vote',value:'6',sourceId:'F1',quote,kind:'fact',period:'2026/2027',method:'structured',unit:'voto',updatedAt:''}]}],sources:[{id:'F1',title:'Fantacalcio',url:'https://www.fantacalcio.it/statistiche-serie-a',text:quote,retrievedAt:date}],warnings:[]};
}
function recommendation(data,id='recommendation-one'){
 return {version:2,lineup:{formation:'3-4-3',starters:['p1'],bench:[]},id,text:'Proposta di test: 3-4-3.',createdAt:data.completedAt,researchAt:data.completedAt,researchId:data.id,teamFingerprint:analysisFingerprint(team),matchday:'6',sources:data.sources};
}
async function database(){
 const pg=new PGlite();const store=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>{text+=`$${i+1}`+strings[i+1]});return (await pg.query(text,values)).rows;});
 const fetchImpl=(url,options={})=>handleTeams(new Request('https://app.test'+url,{...options,headers:{...options.headers,Origin:'https://app.test'}}),{store});
 return {pg,store,fetchImpl};
}
test('research and recommendation survive a second device, overwrite in place, and retain stale recommendation until rerun',async()=>{
 const {pg,store,fetchImpl}=await database();const desktop=new DatabaseTeams({fetchImpl}),phone=new DatabaseTeams({fetchImpl});
 const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Browser storage forbidden');}});
 try{
  await desktop.load();await desktop.save(state());
  let next=withAnalysisResult(desktop.state,team.id,'research',research(),analysisFingerprint(team));await desktop.save(next);
  next=withAnalysisResult(desktop.state,team.id,'recommendation',recommendation(research()),analysisFingerprint(team));await desktop.save(next);
  await phone.load();assert.equal(phone.state.teams[0].formation,'3-4-3');assert.deepEqual(phone.state.teams[0].recommendation.lineup,{formation:'3-4-3',starters:['p1'],bench:[]});assert.equal(phone.state.teams[0].research.id,'research-one');assert.equal(phone.state.teams[0].recommendation.createdAt,now.toISOString());
  const newer=research('research-two','2026-10-07T12:30:00.000Z');
  await desktop.save(withAnalysisResult(desktop.state,team.id,'research',newer,analysisFingerprint(team)));
  await phone.load();let saved=phone.state.teams[0];assert.equal(saved.research.id,'research-two');assert.equal(saved.recommendation.id,'recommendation-one');assert.ok(recommendationIsStale(saved.recommendation,saved,saved.research,'6'));
  await desktop.save(withAnalysisResult(desktop.state,team.id,'recommendation',recommendation(newer,'recommendation-two'),analysisFingerprint(team)));
  await phone.load();saved=phone.state.teams[0];assert.equal(saved.recommendation.researchId,'research-two');assert.equal(saved.recommendation.id,'recommendation-two');assert.equal(recommendationIsStale(saved.recommendation,saved,saved.research,'6'),false);
  const raw=(await pg.query('SELECT state FROM fantaapp_workspace')).rows[0].state;
  assert.ok(!JSON.stringify(raw).includes('research-one'));assert.ok(!JSON.stringify(raw).includes('recommendation-one'));assert.equal(Array.isArray(raw.teams[0].research),false);
  // Ordinary roster edits retain the latest results, while marking the recommendation stale.
  next=desktop.state;next.teams[0].players[0].available=false;await desktop.save(next);await phone.load();saved=phone.state.teams[0];assert.equal(saved.research.id,newer.id);assert.ok(recommendationIsStale(saved.recommendation,saved,saved.research,'6'));
  await desktop.save({teams:[],activeTeamId:null});assert.equal((await store.read()).state.teams.length,0);
 }finally{if(storage)Object.defineProperty(globalThis,'localStorage',storage);else delete globalThis.localStorage;await pg.close();}
});
test('failed saves and concurrent devices cannot erase the last stored analysis',async()=>{
 const {pg,store,fetchImpl}=await database();const a=new DatabaseTeams({fetchImpl}),b=new DatabaseTeams({fetchImpl});
 try{
  await a.load();await a.save(withAnalysisResult(state(),team.id,'research',research(),analysisFingerprint(team)));await b.load();
  await a.save(withAnalysisResult(a.state,team.id,'research',research('newer'),analysisFingerprint(team)));
  await assert.rejects(b.save(withAnalysisResult(b.state,team.id,'research',research('older'),analysisFingerprint(team))),/altro dispositivo/);
  assert.equal((await store.read()).state.teams[0].research.id,'newer');
  a.fetchImpl=async()=>{throw Error('offline');};await assert.rejects(a.save(withAnalysisResult(a.state,team.id,'research',research('lost'),analysisFingerprint(team))));
  assert.equal((await store.read()).state.teams[0].research.id,'newer');
 }finally{await pg.close();}
});
test('result guard rejects deleted teams, changed roster/rules and outdated research associations',()=>{
 const original=state(),updated=state();updated.teams[0].name='Changed';
 assert.throws(()=>withAnalysisResult(updated,team.id,'research',research(),analysisFingerprint(team)),/cambiate/);
 assert.throws(()=>withAnalysisResult({teams:[]},team.id,'research',research(),analysisFingerprint(team)),/non esiste/);
 const saved=withAnalysisResult(original,team.id,'research',research('different'),analysisFingerprint(team));
 assert.throws(()=>withAnalysisResult(saved,team.id,'recommendation',recommendation(research()),analysisFingerprint(team)),/ricerca sono cambiati/);
});
test('stored results whitelist fields and reject malformed timestamps, evidence and excessive text',()=>{
 const input=research();input.apiKey='secret';input.players[0].apiKey='secret';input.understat.apiKey='secret';input.sources[0].apiKey='secret';
 assert.ok(!JSON.stringify(storedResearch(input)).includes('secret'));
 assert.throws(()=>storedResearch({...input,completedAt:'not-a-date'}));
 input.players[0].observations[0].quote='unsupported evidence';assert.throws(()=>storedResearch(input));
 const rec=recommendation(research());assert.throws(()=>storedRecommendation({...rec,text:'x'.repeat(80001)}));
 assert.ok(!JSON.stringify(storedRecommendation({...rec,apiKey:'secret',usage:{secret:'secret'}})).includes('secret'));
 const legacy={...rec,version:1};delete legacy.lineup;assert.equal(storedRecommendation(legacy).text,legacy.text);
 assert.throws(()=>storedRecommendation({...rec,lineup:{...rec.lineup,bench:['p1']}}));
});
test('invalid AI selection cannot replace the previous recommendation or saved module',()=>{
 const saved=withAnalysisResult(state(),team.id,'research',research(),analysisFingerprint(team)),before=structuredClone(saved);
 assert.throws(()=>withAnalysisResult(saved,team.id,'recommendation',{...recommendation(research()),lineup:{formation:'3-4-3',starters:['unknown'],bench:[]}},analysisFingerprint(team)),/non valida/);
 assert.deepEqual(saved,before);
});
test('failed recommendation save requires a reload and preserves the last pitch and module in the database',async()=>{
 const {pg,store,fetchImpl}=await database(),client=new DatabaseTeams({fetchImpl});
 try{
  await client.load();await client.save(withAnalysisResult(state(),team.id,'research',research(),analysisFingerprint(team)));
  await client.save(withAnalysisResult(client.state,team.id,'recommendation',recommendation(research()),analysisFingerprint(team)));
  client.fetchImpl=async()=>{throw Error('offline');};
  const rec={...recommendation(research(),'lost'),lineup:{formation:'4-3-3',starters:['p1'],bench:[]}};
  await assert.rejects(client.save(withAnalysisResult(client.state,team.id,'recommendation',rec,analysisFingerprint(team))));
  assert.equal(client.ready,false);
  assert.equal((await store.read()).state.teams[0].formation,'3-4-3');
  client.fetchImpl=fetchImpl;await client.load();assert.equal(client.state.teams[0].formation,'3-4-3');assert.equal(client.state.teams[0].recommendation.id,'recommendation-one');
 }finally{await pg.close();}
});
