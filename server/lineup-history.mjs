import {analysisFingerprint} from '../src/analysis-state.mjs';
import {teamRules} from '../src/rules.mjs';
import {validateLineup} from '../src/lineup.mjs';
import {recommendationMethod} from '../src/recommendation-methods.mjs';
export {recommendationMethod};
// Capture evidence at generation time, never reconstruct a past roster from today's team.
export function archiveCandidates(state) {
  return state.teams.flatMap(team=>{
    const rec=team.recommendation,research=team.research;
    if(!rec?.lineup||!research||rec.researchId!==research.id||rec.teamFingerprint!==analysisFingerprint(team))return [];
    const match=/^(?:giornata\s*)?(\d{1,2})(?:[ª°])?$/i.exec(rec.matchday.trim());
    const matchday=Number(match?.[1]),season=research.understat?.season;
    if(!Number.isInteger(season)||season<2000||season>2200||!match||matchday<1||matchday>38||rec.matchday!==research.matchday)return [];
    try{validateLineup(rec.lineup,team.players);}catch{return [];}
    return [{teamId:team.id,season,matchday,method:recommendationMethod(rec),recommendationId:rec.id,
      record:{teamName:team.name,listSource:team.listSource,season,matchday,roundStartsAt:research.roundStartsAt??null,
        rules:teamRules(team),players:team.players.map(({id,name,club,role,available})=>({id,name,club,role,available,
          fantacalcioId:research.players.find(p=>p.id===id)?.fantacalcioId??(team.listSource==='leghe'?/^leghe:(\d+)$/.exec(id)?.[1]:null)??null})),recommendation:rec}}];
  });
}
