import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createTeamStore,databaseURL} from '../server/team-store.mjs';
import {handleTeams} from '../server/teams-api.mjs';
import {DatabaseTeams} from '../src/cloud-sync.mjs';
import {createTeam,parseTeamText} from '../src/import-team.mjs';
import {cloudState,EMPTY_STATE} from '../src/cloud-state.mjs';
const squad=(name='Atletico')=>({teams:[{id:'team-1',name,listSource:'leghe',formation:'4-3-3',players:[{id:'p1',name:'Barella',club:'Inter',role:'C',form:null,vote:null,available:true}]}],activeTeamId:'team-1'});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
let id=0;const uuid=()=>`test-mutation-${++id}`;
const request=(payload,origin='https://fanta.test')=>new Request('https://fanta.test/api/teams',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
async function database(){
 const pg=new PGlite();
 const sql=async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>{text+=`$${i+1}`+strings[i+1]});return (await pg.query(text,values)).rows;};
 return {pg,store:createTeamStore(sql)};
}
function transport(store){return (url,options={})=>handleTeams(new Request('https://fanta.test'+url,{...options,headers:{...options.headers,Origin:'https://fanta.test'}}),{store});}
test('Postgres store persists, protects concurrent revisions and safely retries lost responses',async()=>{
 const {pg,store}=await database();try{
  assert.equal((await store.read()).revision,0);
  const payload={revision:0,state:squad(),mutationId:uuid()};
  const outcomes=await Promise.all([store.write(payload),store.write({...payload,state:squad('Other'),mutationId:uuid()})]);
  assert.equal(outcomes.filter(Boolean).length,1);assert.equal((await store.read()).revision,1);
  assert.equal((await store.write(payload)).revision,1);
  assert.equal(await store.write({...payload,state:squad('Tampered')}),null);
  const reloaded=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>{text+=`$${i+1}`+strings[i+1]});return (await pg.query(text,values)).rows;});
  assert.equal((await reloaded.read()).state.teams[0].name,'Atletico');
 }finally{await pg.close();}
});
test('teams API validates requests, strips unrelated secrets and handles missing DB safely',async()=>{
 const {pg,store}=await database();try{
  const payload={revision:0,state:{...squad(),apiKey:'must-not-store'},mutationId:uuid()};
  assert.equal((await handleTeams(request(payload,'https://other.test'),{store})).status,403);
  assert.equal((await handleTeams(request({...payload,state:{teams:[null]}}),{store})).status,400);
  const saved=await handleTeams(request(payload),{store});assert.equal(saved.status,200);assert.equal(JSON.stringify(await saved.json()).includes('must-not-store'),false);
  assert.equal((await handleTeams(request({...payload,mutationId:uuid()}),{store})).status,409);
  assert.equal((await handleTeams(new Request('https://fanta.test/api/teams'),{env:{}})).status,503);
  assert.equal((await handleTeams(new Request('https://fanta.test/api/teams'),{store:{read:()=>{throw new Error('postgres://secret');}}})).status,502);
 }finally{await pg.close();}
});
test('always loads database data and never reads or writes browser team storage',async()=>{
 const {pg,store}=await database();
 globalThis.localStorage={getItem(){throw new Error('must not read browser storage');},setItem(){throw new Error('must not write browser storage');}};
 try{
  await store.write({revision:0,state:squad('Only DB'),mutationId:uuid()});
  const client=new DatabaseTeams({fetchImpl:transport(store),uuid});
  assert.equal(await client.load(),true);assert.equal(client.state.teams[0].name,'Only DB');
  const next=client.state;next.teams[0].name='Updated';await client.save(next);
  const reopened=new DatabaseTeams({fetchImpl:transport(store),uuid});await reopened.load();assert.equal(reopened.state.teams[0].name,'Updated');
 }finally{delete globalThis.localStorage;await pg.close();}
});
test('create with listone and pasted/file text, add and remove players persist through fresh DB reads',async()=>{
 const {pg,store}=await database();const client=new DatabaseTeams({fetchImpl:transport(store),uuid});
 try{
  await client.load();
  const team=createTeam({name:'Atletico',listSource:'leghe',imported:parseTeamText('Squadra: Atletico\nP - Maignan (Milan)\nC - Barella (Inter)')},uuid);
  await client.save({teams:[team],activeTeamId:team.id});
  let loaded=(await store.read()).state;assert.equal(loaded.teams[0].listSource,'leghe');assert.equal(loaded.teams[0].players.length,2);
  loaded.teams[0].players.push({id:'new',name:'Lucca',club:'Napoli',role:'A',form:null,vote:null,available:true});await client.save(loaded);
  loaded=client.state;loaded.teams[0].players=loaded.teams[0].players.filter(p=>p.name!=='Barella');await client.save(loaded);
  const fresh=new DatabaseTeams({fetchImpl:transport(store),uuid});await fresh.load();assert.deepEqual(fresh.state.teams[0].players.map(p=>p.name),['Maignan','Lucca']);
 }finally{await pg.close();}
});
test('offline failures have no fallback or queued writes and require a new database load',async()=>{
 const {pg,store}=await database(),real=transport(store);const client=new DatabaseTeams({fetchImpl:real,uuid});
 try{
  await client.load();client.fetchImpl=async()=>{throw Error('offline');};
  await assert.rejects(client.save(squad()),/Database non raggiungibile/);assert.equal(client.ready,false);assert.equal(client.current,null);
  await assert.rejects(client.save(squad()),/Ricarica/);assert.equal((await store.read()).state.teams.length,0);
  assert.equal(await client.load(),false);assert.equal(client.state.teams.length,0);
  client.fetchImpl=real;await client.load();assert.equal(client.state.teams.length,0);
 }finally{await pg.close();}
});
test('concurrent edits reject stale revisions and reload the latest database version',async()=>{
 const {pg,store}=await database(),fetchImpl=transport(store);const a=new DatabaseTeams({fetchImpl,uuid}),b=new DatabaseTeams({fetchImpl,uuid});
 try{
  await a.load();await b.load();await a.save(squad('Newer'));
  await assert.rejects(b.save(squad('Older')),/altro dispositivo/);assert.equal(b.ready,false);
  await b.load();assert.equal(b.state.teams[0].name,'Newer');
 }finally{await pg.close();}
});
test('lost write response is resolved by reading DB, without recreating a squad',async()=>{
 const {pg,store}=await database(),real=transport(store);const client=new DatabaseTeams({fetchImpl:real,uuid});
 try{
  await client.load();client.fetchImpl=async(url,options)=>{await real(url,options);throw Error('lost response');};
  await assert.rejects(client.save(squad()));assert.equal(client.ready,false);
  client.fetchImpl=real;await client.load();assert.equal(client.state.teams.length,1);assert.equal(client.current.revision,1);
 }finally{await pg.close();}
});

test('resolves Vercel DB-prefixed Neon URLs and ignores individual connection fields',()=>{
 const url='postgresql://test:example@db.example.test/neondb';
 for(const name of ['DATABASE_URL','POSTGRES_URL','DB_DATABASE_URL','DB_POSTGRES_URL','DB_DATABASE_URL_UNPOOLED','DB_POSTGRES_URL_NON_POOLING'])assert.equal(databaseURL({[name]:url}),url);
 assert.equal(databaseURL({DATABASE_URL:' ',DB_DATABASE_URL:url}),url);
 assert.equal(databaseURL({DATABASE_URL:url,DB_DATABASE_URL:'other'}),url);
 assert.equal(databaseURL({DB_PGHOST:'host',DB_POSTGRES_USER:'user',DB_PGDATABASE:'neondb'}),null);
});
