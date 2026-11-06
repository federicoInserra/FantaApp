// Fireworks standard serverless USD rates, verified 2026-10-08.
export const DEFAULT_MODEL='accounts/fireworks/models/deepseek-v4p1-flash';
export const AI_MODELS=[
  {id:DEFAULT_MODEL,label:'DeepSeek V4.1 Flash',input:0.22,cached:0.007,output:0.66,url:'https://fireworks.ai/models/deepseek-ai/deepseek-v4p1-flash'},
  {id:'accounts/fireworks/models/kimi-k3',label:'Kimi K3',input:3,cached:0.30,output:15,url:'https://fireworks.ai/models/fireworks/kimi-k3'},
];
export function modelInfo(id=DEFAULT_MODEL){const model=AI_MODELS.find(m=>m.id===id);if(!model)throw new Error('Modello AI non supportato.');return model;}
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function estimateUsage(model,usage){
  const rates=modelInfo(model);
  const inputTokens=usage?.input_tokens??usage?.prompt_tokens,outputTokens=usage?.output_tokens??usage?.completion_tokens;
  if(!count(inputTokens)||!count(outputTokens))return null;
  const cached=usage?.input_tokens_details?.cached_tokens??usage?.prompt_tokens_details?.cached_tokens??usage?.prompt_cache_hit_tokens;
  if(cached!==undefined&&(!count(cached)||cached>inputTokens))return null;
  // Output totals already include reasoning: never add reasoning tokens again.
  const cachedTokens=cached??0;
  return {inputTokens,outputTokens,cachedTokens,cacheReported:cached!==undefined,usd:((inputTokens-cachedTokens)*rates.input+cachedTokens*rates.cached+outputTokens*rates.output)/1e6,pricingDate:'2026-10-08',inputRate:rates.input,cachedRate:rates.cached,outputRate:rates.output};
}
export function storedAIUsage(usage){
  if(usage===null)return null;
  if(!usage||![usage.inputTokens,usage.outputTokens,usage.cachedTokens].every(count)||usage.cachedTokens>usage.inputTokens||typeof usage.cacheReported!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(usage.pricingDate)||![usage.inputRate,usage.cachedRate,usage.outputRate,usage.usd].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0))throw new Error('Costo AI non valido.');
  const usd=((usage.inputTokens-usage.cachedTokens)*usage.inputRate+usage.cachedTokens*usage.cachedRate+usage.outputTokens*usage.outputRate)/1e6;
  if(Math.abs(usd-usage.usd)>1e-9)throw new Error('Costo AI non valido.');
  return Object.fromEntries(['inputTokens','outputTokens','cachedTokens','cacheReported','usd','pricingDate','inputRate','cachedRate','outputRate'].map(k=>[k,usage[k]]));
}
export function usageLabel(usage){return usage?`Costo stimato: ${new Intl.NumberFormat('it-IT',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:4}).format(usage.usd)} · ${usage.inputTokens.toLocaleString('it-IT')} token in ingresso · ${usage.outputTokens.toLocaleString('it-IT')} in uscita${usage.cacheReported?'':' · sconto cache non comunicato'}`:'Costo non disponibile: token non comunicati da Fireworks.';}
