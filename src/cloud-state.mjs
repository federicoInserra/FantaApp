import {storedResearch,storedRecommendation} from './analysis-state.mjs';
import { isValidState } from './storage.mjs';
export const EMPTY_STATE = {teams:[],activeTeamId:null};
export function validCloudState(state) {
  try {
    if (!isValidState(state) || state.teams.length > 50 || new Set(state.teams.map(t=>t.id)).size !== state.teams.length) return false;
    const text=(v,max)=>typeof v==='string' && v.length>0 && v.length<=max;
    return state.teams.every(t=>text(t.id,150) && text(t.name,100) && t.players.length<=100 && new Set(t.players.map(p=>p.id)).size===t.players.length &&
      (!t.rules || t.rules.every(r=>typeof r==='string' && r.length<=2000)) &&
      t.players.every(p=>text(p.id,150) && text(p.name,200) && text(p.club,150) && (p.available===undefined || typeof p.available==='boolean')));
  } catch { return false; }
}
// An explicit allowlist prevents browser credentials or unrelated local data entering the DB.
export function cloudState(state) {
  if (!validCloudState(state)) throw new Error('Archivio non valido: controlla squadre e giocatori.');
  const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]]));
  const teams=state.teams.map(t=>({...pick(t,['id','name','listSource','formation','rules','importedFrom']),...(t.research?{research:storedResearch(t.research)}:{}),...(t.recommendation?{recommendation:storedRecommendation(t.recommendation)}:{}),players:t.players.map(p=>pick(p,['id','name','club','role','form','vote','available','catalogId','source','quotation','mantra','trequartista','outsideList']))}));
  const result=structuredClone({teams,activeTeamId:teams.some(t=>t.id===state.activeTeamId)?state.activeTeamId:teams[0]?.id??null});
  if(new TextEncoder().encode(JSON.stringify(result)).length>3000000)throw new Error('Archivio troppo grande per essere salvato.');
  return result;
}