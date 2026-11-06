import {storedResearch} from '../src/analysis-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { researchSquad, squadSignature, staleReason, validateExtraction } from '../src/research.mjs';
import {rawLeague,now} from './fixtures/understat.mjs';
const team={id:'one',listSource:'leghe',players:[{id:'p',name:'Player',club:'Inter',role:'A'}]};
const source={id:'S1',url:'https://example.com',text:'Player has played 600 minutes this season.'};
const observation={field:'vote',value:'6',quote:source.text,sourceId:'S1',kind:'fact',unit:'minuti'};
test('unsupported or invented citations and unknown players are discarded',()=>{
 const result=validateExtraction({players:[{id:'p',observations:[observation,{...observation,field:'xg',quote:'invented quote'},{...observation,field:'xa',sourceId:'fake'}]},{id:'stranger',observations:[observation]}]},team.players,[source]);
 assert.deepEqual(result[0].observations.map(o=>o.field),['vote']);assert.ok(result[0].missing.includes('fantamedia'));assert.equal(result.length,1);
});
test('cached data expires and cannot cross squads or matchdays',()=>{
 const now=Date.now(),data={createdAt:new Date(now).toISOString(),signature:squadSignature(team),matchday:'8',understat:{provider:'Understat'},players:[{observations:[observation]}]};
 assert.equal(staleReason(data,team,'8',now),'');assert.match(staleReason(data,team,'9',now),/giornata/);assert.match(staleReason(data,team,'8',now+21600001),/6 ore/);assert.match(staleReason(data,{...team,players:[]},'8',now),/rosa/);
});
test('direct pipeline uses only the three free relays and preserves validated records in storage',async()=>{
 const {parseStats,parseLineups}=await import('../server/fantacalcio-source.mjs');
 const {readFile}=await import('node:fs/promises');
 const players=parseStats(await readFile(new URL('./fixtures/fantacalcio-stats.html',import.meta.url),'utf8'),2026);
 const matches=parseLineups(await readFile(new URL('./fixtures/fantacalcio-lineups.html',import.meta.url),'utf8'),2026);
 const squad={...team,players:[{id:'d',name:'Delprato',club:'Parma',role:'D'}]};let calls=0;
 const fetchImpl=async(url,options)=>{
  calls++;assert.equal(options.headers,undefined);
  if(url==='https://relay.example/api/understat?season=2026'){const league=rawLeague();league.teams[2].title='Parma';league.dates[1].h={id:'1'};league.dates[1].a={id:'2'};return Response.json({season:2026,retrievedAt:now.toISOString(),data:league});}
  if(url==='https://relay.example/api/calendar')return Response.json({version:1,season:2026,retrievedAt:now.toISOString(),fixtures:Array.from({length:10},(_,i)=>({matchday:6,home:i?'Home'+i:'Inter',away:i?'Away'+i:'Parma',kickoff:'2026-10-10T16:00:00Z',status:'UPCOMING'}))});
  assert.equal(url,'https://relay.example/api/fantacalcio');return Response.json({version:1,season:2026,retrievedAt:now.toISOString(),players,matches,warnings:[]});
 };
 const data=await researchSquad({team:squad,fetchImpl,now,understatURL:'https://relay.example'});
 assert.equal(calls,3);assert.equal(data.matchday,'6');assert.ok(data.sources.some(s=>s.id==='L1'));assert.ok(data.players[0].observations.some(o=>o.field==='kickoff'&&o.sourceId==='L1'));assert.equal(data.credits,0);assert.ok(data.players[0].observations.some(o=>o.field==='fantamedia'&&o.value==='5.8'));
 data.id='research-1';data.completedAt=now.toISOString();
 const saved=storedResearch(data);assert.equal(storedResearch(JSON.parse(JSON.stringify(saved))).players[0].observations.length,data.players[0].observations.length);
 await assert.rejects(researchSquad({team:squad,understatURL:'https://relay.example',fetchImpl:async()=>({ok:false,status:502})}),/Understat/);
 assert.equal(saved.createdAt,data.createdAt);
});
