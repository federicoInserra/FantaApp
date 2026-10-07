import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeagueCache,handleVercelUnderstat} from '../server/vercel-understat.mjs';
import {rawLeague,now} from './fixtures/understat.mjs';
test('Vercel adapter permits same-origin requests and leaves no public response cache',async()=>{
 const request=new Request('https://fanta.example/api/understat?season=2026',{headers:{Origin:'https://fanta.example'}});
 const r=await handleVercelUnderstat(request,{now,cache:createLeagueCache(),fetchImpl:async()=>Response.json(rawLeague())});
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal((await r.json()).data.players.length,1);
 const denied=await handleVercelUnderstat(new Request(request.url,{headers:{Origin:'https://other.example'}}),{now,fetchImpl:()=>{throw new Error('must not call');}});assert.equal(denied.status,403);
});
test('warm function cache expires and serves independent copies',async()=>{
 let time=0;const cache=createLeagueCache(()=>time),key=new Request('https://test.example/api/understat?season=2026');
 await cache.put(key,Response.json({ok:true}));assert.deepEqual(await(await cache.match(key)).json(),{ok:true});assert.deepEqual(await(await cache.match(key)).json(),{ok:true});
 time=300000;assert.equal(await cache.match(key),undefined);
});
