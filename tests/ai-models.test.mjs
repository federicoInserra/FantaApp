import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_MODELS,DEFAULT_MODEL,estimateUsage,storedAIUsage,usageLabel} from '../src/ai-models.mjs';
import {buildRequest,parseResponse} from '../src/analysis.mjs';
import {buildFollowUpRequest,askFollowUp,renderFollowUp} from '../src/follow-up.mjs';
import {providerRequest} from '../server/ai-proxy.mjs';
import {analysisFingerprint,storedRecommendation,storedFollowUp} from '../src/analysis-state.mjs';
import {players,lineup,forecastFor} from './fixtures/lineup.mjs';
const kimi=AI_MODELS[1].id,now=new Date('2026-10-08T12:00:00Z');
const usage={input_tokens:10000,output_tokens:5000,input_tokens_details:{cached_tokens:4000},output_tokens_details:{reasoning_tokens:4500}};
function context(){
 const team={id:'one',name:'Team',listSource:'leghe',players};
 team.research={id:'r1',createdAt:now.toISOString(),completedAt:now.toISOString(),matchday:'6',understat:{provider:'Understat'},players:[],sources:[],warnings:[]};
 team.recommendation={version:2,id:'rec',model:kimi,aiUsage:estimateUsage(kimi,usage),createdAt:now.toISOString(),researchAt:now.toISOString(),researchId:'r1',teamFingerprint:analysisFingerprint(team),matchday:'6',text:'Proposta',lineup,forecast:forecastFor(lineup),sources:[]};
 return team;
}
test('both models receive exactly the same prompt and request settings and use the same structured parser',()=>{
 const team=context();const a=buildRequest(team,'6','',now,team.research),b=buildRequest(team,'6','',now,team.research,kimi);
 assert.equal(a.model,DEFAULT_MODEL);assert.equal(b.model,kimi);
 assert.deepEqual({...a,model:kimi},b);
 for(const request of [a,b])assert.deepEqual(providerRequest('fireworks',request).body,request);
 assert.throws(()=>buildRequest(team,'6','',now,team.research,'unknown'),/supportato/);
 assert.throws(()=>providerRequest('fireworks',{...b,model:'unknown'}));
 assert.throws(()=>providerRequest('fireworks',{...b,max_output_tokens:131073}));
 const data={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({...lineup,forecast:forecastFor(lineup),analysis:'Scelte motivate'})}]}]};
 assert.deepEqual(parseResponse({...data,model:kimi},team.research,team).lineup,lineup);
});
test('estimates distinguish uncached, cached and output tokens without double billing reasoning',()=>{
 assert.equal(estimateUsage(kimi,usage).usd,0.0942);
 assert.equal(estimateUsage(DEFAULT_MODEL,usage).usd,0.004648);
 const chat=estimateUsage(kimi,{prompt_tokens:10000,completion_tokens:5000,prompt_tokens_details:{cached_tokens:4000}});
 assert.deepEqual(chat,estimateUsage(kimi,usage));
 const unknownCache=estimateUsage(kimi,{input_tokens:10000,output_tokens:5000});
 assert.equal(unknownCache.usd,0.105);assert.equal(unknownCache.cacheReported,false);assert.match(usageLabel(unknownCache),/sconto cache non comunicato/);
 for(const u of [undefined,{}, {...usage,input_tokens:-1},{...usage,output_tokens:NaN},{...usage,input_tokens_details:{cached_tokens:10001}}])assert.equal(estimateUsage(kimi,u),null);
 assert.notEqual(estimateUsage(kimi,{input_tokens:0,output_tokens:0}),null);
 assert.match(usageLabel(null),/non disponibile/);
});
test('saved model and usage are whitelisted and preserve original rates while legacy recommendations remain compatible',()=>{
 const team=context(),saved=storedRecommendation(team.recommendation);
 assert.deepEqual(saved.aiUsage,estimateUsage(kimi,usage));assert.equal(saved.model,kimi);
 assert.deepEqual(storedAIUsage({...saved.aiUsage,secret:'ignore'}),saved.aiUsage);
 const follow=storedFollowUp({id:'q1',createdAt:now.toISOString(),question:'Why?',answer:'Reason',model:kimi,aiUsage:saved.aiUsage});
 assert.equal(follow.model,kimi);assert.deepEqual(follow.aiUsage,saved.aiUsage);
 assert.throws(()=>storedRecommendation({...saved,model:'arbitrary'}));
 assert.throws(()=>storedRecommendation({...saved,aiUsage:{...saved.aiUsage,usd:99}}));
 const legacy={...saved};delete legacy.model;delete legacy.aiUsage;assert.equal(storedRecommendation(legacy).model,undefined);
});
test('follow-ups stick to the original model and return cost alongside the answer',async()=>{
 const team=context();assert.equal(buildFollowUpRequest({team,question:'Why?',now}).model,kimi);
 const result=await askFollowUp({key:'test',team,question:'Why?',includeUsage:true,now,fetchImpl:async(url,options)=>{
  assert.equal(JSON.parse(options.body).model,kimi);
  return {ok:true,json:async()=>({status:'completed',usage,output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Because'}]}]})};
 }});
 assert.equal(result.answer,'Because');assert.equal(result.model,kimi);assert.deepEqual(result.aiUsage,team.recommendation.aiUsage);
 assert.match(renderFollowUp(team),/Chiedi a Kimi K3/);assert.doesNotMatch(renderFollowUp(team),/DeepSeek/);
 delete team.recommendation.model;assert.equal(buildFollowUpRequest({team,question:'Why?',now}).model,DEFAULT_MODEL);
});
