import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAI} from '../server/ai-proxy.mjs';
import {postJSON, ENDPOINT, getAIStatus} from '../src/ai-api.mjs';
const env={FIREWORKS_API_KEY:'server-fireworks-test-secret',TAVILY_API_KEY:'server-tavily-test-secret'};
const body={model:'accounts/fireworks/models/deepseek-v4p1-flash',store:false,max_output_tokens:6000,instructions:'Choose the formation',input:'{}'};
const request=(action='fireworks',payload=body,headers={})=>new Request('https://fanta.example/api/ai',{method:'POST',headers:{Origin:'https://fanta.example','Content-Type':'application/json',...headers},body:JSON.stringify({action,body:payload})});
test('server status reports booleans only, with no cached credentials',async()=>{
 const response=await handleAI(new Request('https://fanta.example/api/ai-status'),{env});
 assert.deepEqual(await response.json(),{fireworks:true,tavily:true});assert.equal(response.headers.get('cache-control'),'private, no-store');
 const missing=await handleAI(new Request('https://fanta.example/api/ai-status'),{env:{}});assert.deepEqual(await missing.json(),{fireworks:false,tavily:false});
});
test('proxy injects only the selected server credential and strips credential echoes',async()=>{
 let calls=0;
 const r=await handleAI(request('fireworks',body,{Authorization:'Bearer browser-secret'}),{env,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,ENDPOINT);assert.equal(options.headers.Authorization,`Bearer ${env.FIREWORKS_API_KEY}`);assert.equal(options.redirect,'error');assert.equal(options.headers.Cookie,undefined);assert.deepEqual(JSON.parse(options.body),body);
  return Response.json({output:env.FIREWORKS_API_KEY});
 }});
 assert.equal(calls,1);assert.equal(r.status,200);assert.equal((await r.json()).output,'[redacted]');
});
test('proxy rejects cross-site calls, tools, arbitrary models, excessive tokens and URLs before fetching',async()=>{
 const options={env,fetchImpl:()=>{throw new Error('must not fetch');}};
 assert.equal((await handleAI(request('fireworks',body,{Origin:'https://evil.example'}),options)).status,403);
 for(const payload of [{...body,tools:[{type:'web_search'}]},{...body,model:'expensive-model'},{...body,max_output_tokens:12001},{...body,model:'accounts/fireworks/models/glm-5p3-flash',max_output_tokens:6001}]) assert.equal((await handleAI(request('fireworks',payload),options)).status,400);
 assert.equal((await handleAI(request('fireworks',{...body,max_output_tokens:12000}),{env,fetchImpl:async()=>Response.json({status:'completed'})})).status,200);
 assert.equal((await handleAI(request('extract',{urls:['http://127.0.0.1/']}),options)).status,400);
 assert.equal((await handleAI(request('search',{query:'football',include_domains:['evil.example']}),options)).status,400);
 assert.equal((await handleAI(request('fireworks',{...body,input:'a'.repeat(520000)}),options)).status,413);
});
test('Tavily proxy fixes budget options and uses only Tavily credentials',async()=>{
 for(const action of ['search','extract']){
  const payload=action==='search'?{query:'Barella Inter',include_domains:['fantacalcio.it'],max_results:100,search_depth:'advanced'}:{urls:['https://www.fantacalcio.it/statistiche-serie-a']};
  const response=await handleAI(request(action,payload),{env,fetchImpl:async(url,options)=>{
   assert.equal(url,`https://api.tavily.com/${action}`);assert.equal(options.headers.Authorization,`Bearer ${env.TAVILY_API_KEY}`);
   const data=JSON.parse(options.body);if(action==='search'){assert.equal(data.max_results,2);assert.equal(data.search_depth,'basic');}return Response.json({results:[]});
  }});assert.equal(response.status,200);
 }
});
test('missing keys, provider errors, bad JSON and timeouts fail safely without retries',async()=>{
 assert.equal((await handleAI(request(),{env:{}})).status,503);
 let calls=0;
 const response=await handleAI(request(),{env,fetchImpl:async()=>{calls++;return new Response(env.FIREWORKS_API_KEY,{status:401});}});
 assert.equal(calls,1);assert.equal(response.status,401);assert.equal((await response.text()).includes(env.FIREWORKS_API_KEY),false);
 assert.equal((await handleAI(request(),{env,fetchImpl:async()=>new Response('bad-json')})).status,502);
 assert.equal((await handleAI(request(),{env,fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');}})).status,504);
});
test('hosted client routes locally without keys; expired login and missing configuration are clear',async()=>{
 await postJSON(ENDPOINT,'old-browser-secret',body,{hosted:true,fetchImpl:async(url,options)=>{
  assert.equal(url,'/api/ai');assert.equal(options.credentials,'same-origin');assert.equal(options.headers.Authorization,undefined);assert.equal(options.body.includes('old-browser-secret'),false);assert.deepEqual(JSON.parse(options.body),{action:'fireworks',body});return Response.json({ok:true});
 }});
 await assert.rejects(postJSON(ENDPOINT,'',body,{hosted:true,fetchImpl:async()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}})}),/Sessione scaduta/);
 await assert.rejects(postJSON(ENDPOINT,'',body,{hosted:true,fetchImpl:async()=>Response.json({},{status:503})}),/variabili ambiente/);
 assert.deepEqual(await getAIStatus({fetchImpl:async()=>Response.json({fireworks:true,tavily:false})}),{fireworks:true,tavily:false});
});
