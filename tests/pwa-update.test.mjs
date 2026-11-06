import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const worker = await readFile(new URL('../sw.js',import.meta.url),'utf8');
const pwa = (await readFile(new URL('../src/pwa.mjs',import.meta.url),'utf8')).replaceAll('import.meta.url',JSON.stringify('https://app.example/src/pwa.mjs'));

test('a fully cached app update activates with existing clients and serves the new shell together',async()=>{
  const handlers={},calls=[],stored=new Map();
  let finishCaching;
  const cache={addAll:async assets=>{
    await new Promise(resolve=>{finishCaching=resolve;});
    for(const asset of assets) stored.set(new URL(asset,'https://app.example/').href,`new:${asset}`);
  },match:async request=>stored.get(request.url)};
  runInNewContext(worker,{
    URL,self:{registration:{scope:'https://app.example/'},addEventListener:(name,fn)=>handlers[name]=fn,
      skipWaiting:async()=>calls.push('activate-with-existing-clients'),clients:{claim:async()=>calls.push('claim')}},
    caches:{open:async()=>cache,keys:async()=>['fantaapp-https://app.example/-v52','another-app'],delete:async key=>calls.push(`delete:${key}`)},
    fetch:()=>assert.fail('cached shell must be coherent')
  });
  let install;
  handlers.install({waitUntil:promise=>install=promise});
  await Promise.resolve();assert.deepEqual(calls,[]);
  finishCaching();await install;
  assert.deepEqual(calls,['activate-with-existing-clients']);
  let activation;handlers.activate({waitUntil:promise=>activation=promise});await activation;
  assert.ok(calls.includes('claim'));assert.ok(calls.includes('delete:fantaapp-https://app.example/-v52'));
  assert.ok(!calls.includes('delete:another-app'));
  for(const [path,asset]of [['/index.html','./index.html'],['/src/understat.mjs','./src/understat.mjs']]) {
    let response;handlers.fetch({request:{url:`https://app.example${path}`,method:'GET'},respondWith:p=>response=p});
    assert.equal(await response,`new:${asset}`);
  }
  handlers.fetch({request:{url:'https://app.example/api/understat?season=2026',method:'GET'},respondWith:()=>assert.fail('API must stay on the network')});
});

test('failed app-shell caching never activates a partially installed release',async()=>{
  const handlers={};
  runInNewContext(worker,{URL,self:{registration:{scope:'https://app.example/'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>assert.fail('must keep previous working release')},
    caches:{open:async()=>({addAll:async()=>{throw new Error('network failure')}})}});
  let install;handlers.install({waitUntil:promise=>install=promise});
  await assert.rejects(install,/network failure/);
});

test('an already open app offers a reload after update, without interrupting edits',async()=>{
  const events={},documentEvents={},registrations=[];let reloads=0,checks=0;
  const status={textContent:'',button:null,append(space,button){this.button=button;},querySelector(){return this.button;}};
  const registration={update:async()=>{checks++;}};
  const document={visibilityState:'visible',querySelector:()=>status,createElement:()=>({}),addEventListener:(event,fn)=>documentEvents[event]=fn};
  runInNewContext(pwa,{URL,document,location:{reload:()=>reloads++},navigator:{serviceWorker:{controller:{},ready:Promise.resolve(),
    addEventListener:(event,fn)=>events[event]=fn,register:async(url,options)=>{registrations.push({url:url.href,updateViaCache:options.updateViaCache});return registration;}}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(registrations,[{url:'https://app.example/sw.js',updateViaCache:'none'}]);
  events.controllerchange();
  assert.equal(reloads,0);assert.equal(status.button.textContent,'Aggiorna app');
  assert.match(status.textContent,/Nuova versione pronta/);
  status.button.onclick();assert.equal(reloads,1);
  documentEvents.visibilitychange();assert.equal(checks,1);
  document.visibilityState='hidden';documentEvents.visibilitychange();assert.equal(checks,1);
});
