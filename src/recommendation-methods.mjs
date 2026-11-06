import {AI_MODELS,DEFAULT_MODEL,modelInfo} from './ai-models.mjs';
export const MANUAL_METHODS=[{id:'chatgpt',label:'ChatGPT'},{id:'federico',label:'Federico'}];
export const isManualMethod=id=>MANUAL_METHODS.some(method=>method.id===id);
export function recommendationMethod(rec){
  if(rec.method==='statistical-engine'||isManualMethod(rec.method))return rec.method;
  return (rec.model??DEFAULT_MODEL)===AI_MODELS[1].id?'kimi':'deepseek';
}
export function recommendationLabel(rec){
  if(rec.method==='statistical-engine')return 'Statistical engine';
  return MANUAL_METHODS.find(m=>m.id===rec.method)?.label??modelInfo(rec.model??DEFAULT_MODEL).label;
}
