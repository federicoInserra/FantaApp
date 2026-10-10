import {analysisFingerprint,storedRecommendation} from './analysis-state.mjs';
import {recommendationMethod,isManualMethod} from './recommendation-methods.mjs';
import {validateLineup} from './lineup.mjs';

export const methodId=model=>recommendationMethod(model==='statistical-engine'||isManualMethod(model)?{method:model}:{model});
export function lineupRound(team,matchday=team.research?.matchday??'') {
  const match=/^(?:giornata\s*)?(\d{1,2})(?:[ª°])?$/i.exec(matchday.trim()),season=team.research?.understat?.season,day=Number(match?.[1]);
  return Number.isInteger(season)&&season>=2000&&season<=2200&&day>=1&&day<=38?{season,matchday:day}:null;
}
export const selectionKey=(team,model,matchday)=>JSON.stringify([team.id,lineupRound(team,matchday),team.research?.id,analysisFingerprint(team),model]);
export async function fetchMethodLineup(team,model,matchday,{fetchImpl=fetch,signal}={}) {
  const round=lineupRound(team,matchday);if(!round)return null;
  const response=await fetchImpl(`/api/lineups?${new URLSearchParams({teamId:team.id,...round})}`,{credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok)throw Error('Impossibile caricare la formazione salvata. Riprova.');
  const data=await response.json();if(!Array.isArray(data.items))throw Error('Archivio delle formazioni non disponibile.');
  const record=data.items.find(item=>item.method===methodId(model))?.record;if(!record)return null;
  const rec=storedRecommendation(record.recommendation);
  if(record.season!==round.season||record.matchday!==round.matchday||Number(/\d{1,2}/.exec(rec.matchday)?.[0])!==round.matchday||recommendationMethod(rec)!==methodId(model))throw Error('La formazione salvata non corrisponde al metodo o alla giornata.');
  validateLineup(rec.lineup,record.players);
  return {...record,recommendation:rec};
}
// A slow response from an earlier selection must never replace the current pitch.
export class MethodLineups {
  constructor(fetchImpl=fetch){this.fetchImpl=fetchImpl;this.current=null;}
  invalidate(){this.controller?.abort();this.current=null;}
  async select(team,model,matchday,onChange=()=>{}){
    this.controller?.abort();const controller=new AbortController();this.controller=controller;
    const item={key:selectionKey(team,model,matchday),model,state:'loading',record:null,error:''};this.current=item;onChange();
    try{const record=await fetchMethodLineup(team,model,matchday,{fetchImpl:this.fetchImpl,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(this.current!==item)return;item.record=record;item.state='ready';
    }catch(error){if(this.current!==item)return;item.state='error';item.error=error.message;}
    onChange();
  }
}
export function selectedLineupTeam(team,record) {
  if(!record)return {...team,recommendation:null};
  // Keep the live conversation when this is still the team's latest proposal.
  const recommendation=team.recommendation?.id===record.recommendation.id?team.recommendation:record.recommendation;
  return {...team,players:record.players,recommendation,formation:recommendation.lineup.formation};
}
