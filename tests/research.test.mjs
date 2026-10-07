import test from 'node:test';
import assert from 'node:assert/strict';
import { researchSquad, squadSignature, staleReason, validateExtraction, saveResearch, loadResearch } from '../src/research.mjs';
import {rawLeague,now} from './fixtures/understat.mjs';
const team={id:'one',listSource:'leghe',players:[{id:'p',name:'Player',club:'Inter',role:'A'}]};
const source={id:'S1',url:'https://example.com',text:'Player has played 600 minutes this season.'};
const observation={field:'vote',value:'6',quote:source.text,sourceId:'S1',kind:'fact',unit:'minuti'};
test('unsupported or invented citations and unknown players are discarded',()=>{
 const result=validateExtraction({players:[{id:'p',observations:[observation,{...observation,field:'xg',quote:'invented quote'},{...observation,field:'xa',sourceId:'fake'}]},{id:'stranger',observations:[observation]}]},team.players,[source]);
 assert.deepEqual(result[0].observations.map(o=>o.field),['vote']);assert.ok(result[0].missing.includes('xg'));assert.equal(result.length,1);
});
test('cached data expires and cannot cross squads or matchdays',()=>{
 const now=Date.now(),data={createdAt:new Date(now).toISOString(),signature:squadSignature(team),matchday:'8',understat:{provider:'Understat'},players:[{observations:[observation]}]};
 assert.equal(staleReason(data,team,'8',now),'');assert.match(staleReason(data,team,'9',now),/giornata/);assert.match(staleReason(data,team,'8',now+21600001),/6 ore/);assert.match(staleReason(data,{...team,players:[]},'8',now),/rosa/);
});
test('pipeline separates secrets, uses no web tools in Fireworks, and stores validated evidence',async()=>{
 let calls=0;
 const fetchImpl=async(url,options)=>{
  calls++;if(url.startsWith('https://relay.example')){assert.equal(options.headers,undefined);return Response.json({season:2026,retrievedAt:now.toISOString(),data:rawLeague()});}
  const body=JSON.parse(options.body),fw=url.includes('fireworks');
  assert.equal(options.headers.Authorization,fw?'Bearer fw-secret':'Bearer tv-secret');assert.ok(!options.body.includes('secret'));
  if(fw){assert.equal(body.tools,undefined);return {ok:true,json:async()=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({players:[{id:'p',observations:[observation]}]})}]}]})};}
  return {ok:true,json:async()=>({results:[{url:source.url,raw_content:source.text}],usage:{credits:1}})};
 };
 const data=await researchSquad({tavilyKey:'tv-secret',fireworksKey:'fw-secret',team,fetchImpl,now,understatURL:'https://relay.example'});assert.equal(calls,5);assert.equal(data.credits,3);assert.equal(data.players[0].observations.length,1);
 const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};saveResearch(team.id,data,storage);assert.equal(loadResearch(team.id,storage).players[0].observations.length,1);assert.equal(loadResearch('other',storage),null);
 await assert.rejects(researchSquad({tavilyKey:'tv-secret',fireworksKey:'fw-secret',team,understatURL:'https://relay.example',fetchImpl:async()=>({ok:false,status:429})}),/Understat non disponibile/);assert.equal(loadResearch(team.id,storage).createdAt,data.createdAt);
});
