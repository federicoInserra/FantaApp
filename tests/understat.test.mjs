import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLeague,matchSquad,understatSnapshot,fetchUnderstat,understatServiceURL} from '../src/understat.mjs';
import {handleRequest} from '../worker/understat-worker.mjs';
import {rawLeague,now} from './fixtures/understat.mjs';
test('calculates player rates and separate team home/away samples from public numeric data',()=>{
 const d=normalizeLeague(rawLeague(),2026,now),p=d.players[0],t=d.teams[0];
 assert.equal(p.npxgPer90,0.45);assert.equal(p.xaPer90,0.2);assert.equal(t.overall.games,2);assert.equal(t.overall.xgaPerMatch,1);assert.equal(t.home.xgaPerMatch,0.5);assert.equal(t.away.xgaPerMatch,1.5);assert.equal(d.fixtures[1].kickoff,'2026-10-10T18:45:00Z');
 const snapshot=understatSnapshot(d,[{id:'roster',name:'Player S',club:'Inter'}],now);assert.equal(snapshot.players[0].player.id,'1');assert.equal(snapshot.fixtures.length,1);
});
test('zero and missing are different, and per-90 rates are absent for no minutes',()=>{
 const raw=rawLeague();Object.assign(raw.players[0],{time:'0',xG:'0',npxG:'0',xA:null});raw.teams[1].history[0].xGA=null;
 const d=normalizeLeague(raw,2026,now);assert.equal(d.players[0].xg,0);assert.equal(d.players[0].xa,null);assert.equal(d.players[0].xgPer90,null);assert.equal(d.teams[0].overall.xga,null);assert.equal(d.teams[0].away.xgaPerMatch,1.5);
});
test('matching uses club and whole tokens; ambiguous and wrong-club players stay missing',()=>{
 const raw=rawLeague();raw.players.push({...raw.players[0],id:'2',player_name:'Second Player'});const d=normalizeLeague(raw,2026,now);
 assert.match(matchSquad(d,[{id:'r',name:'Player S',club:'Inter'}])[0].reason,/ambiguo/);
 assert.equal(matchSquad(d,[{id:'r',name:'Sample Player',club:'Inter'}])[0].player.id,'1');
 assert.equal(matchSquad(d,[{id:'r',name:'Sample Player',club:'Milan'}])[0].player,null);
});
test('schema drift, negative stats, mixed seasons and duplicates fail closed',()=>{
 for(const mutate of [r=>r.players[0].xG='unknown',r=>r.players[0].time=-1,r=>r.dates[0].datetime='2025-09-01 18:45:00',r=>r.players.push({...r.players[0]}),r=>r.dates[0].isResult='true']){
  const r=rawLeague();mutate(r);assert.throws(()=>normalizeLeague(r,2026,now),/Formato/);
 }
});
test('relay has a fixed upstream, restricted CORS, validated input and safe errors',async()=>{
 let calls=0;const fetchImpl=async(url,options)=>{calls++;assert.equal(url,'https://understat.com/getLeagueData/Serie_A/2026');assert.equal(options.headers['X-Requested-With'],'XMLHttpRequest');assert.equal(options.headers.Authorization,undefined);return Response.json(rawLeague());};
 const request=new Request('https://relay.example/api/understat?season=2026',{headers:{Origin:'https://federicoinserra.github.io',Authorization:'never-forward'}});
 const response=await handleRequest(request,{}, {fetchImpl,now});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://federicoinserra.github.io');
 assert.equal((await response.json()).data.players.length,1);
 for(const url of ['https://relay.example/api/understat?season=2026&url=https://evil.example','https://relay.example/api/understat?season=9999']) assert.equal((await handleRequest(new Request(url),{}, {fetchImpl,now})).status,400);
 assert.equal((await handleRequest(new Request(request.url,{headers:{Origin:'https://evil.example'}}),{}, {fetchImpl,now})).status,403);assert.equal(calls,1);
 const failed=await handleRequest(request,{}, {fetchImpl:async()=>new Response('private upstream error',{status:500}),now});assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('private'));
});
test('client never sends secrets and rejects stale snapshots and unsafe service URLs',async()=>{
 const fetchImpl=async(url,options)=>{assert.equal(url,'https://relay.example/api/understat?season=2026');assert.equal(options.headers,undefined);assert.equal(options.credentials,'same-origin');return Response.json({season:2026,retrievedAt:now.toISOString(),data:rawLeague()});};
 assert.equal((await fetchUnderstat({serviceURL:'https://relay.example',season:2026,now,fetchImpl})).players.length,1);
 await assert.rejects(fetchUnderstat({serviceURL:'https://relay.example',season:2026,now:new Date(now.getTime()+16*60000),fetchImpl}),/scaduta/);
 for(const url of ['http://evil.example','https://key@relay.example','https://relay.example/?secret=x'])assert.throws(()=>understatServiceURL(url));
 assert.equal(understatServiceURL('http://localhost:8007'),'http://localhost:8007');
});
test('cached relay responses are reused without fetching and get request-specific CORS',async()=>{
 const entries=new Map(),cache={match:async key=>entries.get(key.url)?.clone(),put:async(key,value)=>entries.set(key.url,value)};
 const env={ALLOWED_ORIGINS:'https://one.example,https://two.example'};let calls=0;
 const fetchImpl=async()=>{calls++;return Response.json(rawLeague());};
 for(const origin of ['https://one.example','https://two.example']){
  const r=await handleRequest(new Request('https://relay.example/api/understat?season=2026',{headers:{Origin:origin}}),env,{fetchImpl,cache,now});
  assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.status,200);
 }
 assert.equal(calls,1);
});
