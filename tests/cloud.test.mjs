import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createTeamStore} from '../server/team-store.mjs';
import {handleTeams} from '../server/teams-api.mjs';
import {CloudSync,CLOUD_KEY,BACKUP_KEY} from '../src/cloud-sync.mjs';
import {cloudState,mergeTeams,EMPTY_STATE} from '../src/cloud-state.mjs';
import {LEGACY_KEY} from '../src/storage.mjs';
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
test('first migration is explicit, additive and repeat imports do not duplicate teams',async()=>{
 const {pg,store}=await database();const storage=memory();storage.setItem(LEGACY_KEY,JSON.stringify(squad()));
 const sync=new CloudSync({storage,fetchImpl:transport(store),uuid,delay:100000});
 try{
  assert.equal(await sync.refresh(),false);assert.equal(sync.mode,'import');assert.equal((await store.read()).state.teams.length,0);assert.ok(storage.getItem(BACKUP_KEY));
  assert.equal(await sync.importLocal(),true);assert.equal(sync.mode,'saved');
  await sync.importLocal(squad());assert.equal((await store.read()).state.teams.length,1);
  await sync.importLocal(squad('Changed'));assert.equal((await store.read()).state.teams.length,2);
 }finally{sync.dispose();await pg.close();}
});
test('offline edits survive reload and older device changes cannot overwrite the cloud',async()=>{
 const {pg,store}=await database();const storage=memory();const fetchImpl=transport(store);
 const first=new CloudSync({storage,fetchImpl,uuid,delay:100000});let restored;
 try{
  await first.refresh();first.save(squad());first.fetchImpl=async()=>{throw new Error('offline');};assert.equal(await first.flush(),false);assert.equal(first.entry.dirty,true);
  restored=new CloudSync({storage,fetchImpl,uuid,delay:100000});await restored.refresh();assert.equal(restored.mode,'saved');assert.equal((await store.read()).state.teams.length,1);
  const remote=await store.read();await store.write({revision:remote.revision,state:squad('Newer device'),mutationId:uuid()});
  restored.save(squad('Offline edit'));await restored.flush();assert.equal(restored.mode,'conflict');assert.equal((await store.read()).state.teams[0].name,'Newer device');
  await restored.importLocal();assert.equal((await store.read()).state.teams.length,2);
 }finally{first.dispose();restored?.dispose();await pg.close();}
});
test('same-browser tabs cannot silently overwrite each other and recovery preserves both drafts',async()=>{
 const {pg,store}=await database();const storage=memory();const fetchImpl=transport(store);
 const a=new CloudSync({storage,fetchImpl,uuid,delay:100000});await a.refresh();
 const b=new CloudSync({storage,fetchImpl,uuid,delay:100000});
 try{
  a.save(squad('Tab A'));assert.throws(()=>b.save(squad('Tab B')),/altra scheda/);assert.equal(JSON.parse(storage.getItem(CLOUD_KEY)).state.teams[0].name,'Tab A');
  await b.useCloud();assert.equal(JSON.parse(storage.getItem(BACKUP_KEY)).teams[0].name,'Tab A');
 }finally{a.dispose();b.dispose();await pg.close();}
});
test('edits during an in-flight save remain pending until a second successful write',async()=>{
 const {pg,store}=await database();const storage=memory();const real=transport(store);let release;
 const sync=new CloudSync({storage,fetchImpl:real,uuid,delay:100000});
 try{
  await sync.refresh();sync.save(squad('First'));
  sync.fetchImpl=async(url,options)=>{await new Promise(resolve=>release=resolve);return real(url,options);};
  const saving=sync.flush();sync.save(squad('Second'));release();await saving;assert.equal(sync.entry.dirty,true);assert.equal(sync.state.teams[0].name,'Second');
  sync.fetchImpl=real;await sync.flush();assert.equal((await store.read()).state.teams[0].name,'Second');assert.equal(sync.entry.dirty,false);
 }finally{sync.dispose();await pg.close();}
});
test('unknown backup fields are excluded, invalid backups rejected and merging preserves originals',()=>{
 const original=squad();assert.equal(cloudState({...original,key:'secret'}).key,undefined);
 assert.throws(()=>cloudState({teams:[null]}));assert.equal(mergeTeams(original,squad(),uuid).teams.length,1);
 const merged=mergeTeams(original,squad('Copy'),uuid);assert.equal(merged.teams.length,2);assert.equal(original.teams.length,1);assert.notEqual(merged.teams[0].id,merged.teams[1].id);
});
test('a lost successful response can be retried after reload without duplicating the write',async()=>{
 const {pg,store}=await database(),storage=memory(),real=transport(store);
 const a=new CloudSync({storage,fetchImpl:real,uuid,delay:100000});let b;
 try{
  await a.refresh();a.save(squad());
  a.fetchImpl=async(url,options)=>{await real(url,options);throw new Error('connection lost after commit');};
  await a.flush();assert.equal(a.entry.dirty,true);assert.equal((await store.read()).revision,1);
  b=new CloudSync({storage,fetchImpl:real,uuid,delay:100000});await b.refresh();assert.equal(b.entry.dirty,false);assert.equal((await store.read()).revision,1);
 }finally{a.dispose();b?.dispose();await pg.close();}
});
