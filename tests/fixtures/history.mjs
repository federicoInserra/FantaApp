import {statisticalFixture} from './statistical.mjs';
import {storedResearch,analysisFingerprint} from '../../src/analysis-state.mjs';
import {DEFAULT_MODEL,AI_MODELS} from '../../src/ai-models.mjs';
import {forecastFor} from './lineup.mjs';
import {forecastTotals} from '../../src/forecast.mjs';
import {defaultRules} from '../../src/rules.mjs';
import {archiveCandidates} from '../../server/lineup-history.mjs';
import {votesURL} from '../../server/matchday-votes.mjs';
export function historyFixture({season=2026,matchday=8}={}) {
  const f=statisticalFixture(new Date(`${season}-10-01T12:00:00Z`));
  f.team.rules=defaultRules();f.research.matchday=String(matchday);
  f.research.players.forEach((p,i)=>p.fantacalcioId=String(i+1));
  f.team.research=storedResearch(f.research);
  const lineup={formation:'4-3-3',starters:['P0','D0','D1','D2','D3','C0','C1','C2','A0','A1','A2'],bench:['P1','P2','D4','D5','D6','D7','C3','C4','C5','C6','C7','A3','A4','A5']};
  const rec=(method,id=method)=>{
    const forecast=forecastFor(lineup);
    return {version:2,id,createdAt:f.now.toISOString(),researchAt:f.research.completedAt,researchId:f.research.id,teamFingerprint:analysisFingerprint(f.team),matchday:String(matchday),text:`Synthetic ${method} suggestion`,lineup:structuredClone(lineup),forecast,sources:[],
      ...(method==='statistical-engine'?{method,engine:{version:'1.0',seed:1,simulations:100,candidates:1,expected:forecastTotals(forecast).expected,p10:forecast.low,p90:forecast.high,threshold66:.5,missing:0}}:{model:method==='kimi'?AI_MODELS[1].id:DEFAULT_MODEL})};
  };
  f.team.recommendation=rec('deepseek');
  const state={teams:[f.team],activeTeamId:f.team.id};
  const record=archiveCandidates(state)[0].record;
  const votes={version:1,provider:'Redazione Fantacalcio',season,matchday,sourceUrl:votesURL(season,matchday),retrievedAt:`${season}-10-03T12:00:00.000Z`,complete:true,clubs:Array.from({length:20},(_,i)=>`Club ${i}`),players:record.players.map(p=>({id:p.fantacalcioId,name:p.name,club:p.club,role:p.role,status:'rated',vote:6,fantasyVote:6,conceded:0}))};
  return {state,team:f.team,record,rec,votes};
}
export function voteHTML(data,{status='4'}={}) {
  const tables=data.clubs.map((club,i)=>{
    let players=data.players.filter(p=>p.club===club);
    if(!players.length)players=[{id:String(100+i),name:`Player ${i}`,role:'A',status:'rated',vote:6,fantasyVote:6,conceded:0}];
    return `<li class="team-table"><table><thead><tr><th><a class="team-name"><meta itemprop="name" content="${club}"></a></th><th><div class="group"><img title="Redazione Fantacalcio"><img title="Voto Statistico"><img title="Voto Italia"></div></th><th><img title="Redazione Fantacalcio"></th></tr></thead><tbody>${players.map(p=>`<tr><td><span class="role" data-value="${p.role.toLowerCase()}"></span><a class="player-name" href="https://www.fantacalcio.it/serie-a/squadre/club-${i}/player/${p.id}">${p.name}</a></td><td><div class="pill"><span class="player-grade" data-value="${p.status==='unrated'?'55':p.vote}"></span><span class="player-fanta-grade" data-value="${p.status==='unrated'?'55':p.fantasyVote}"></span></div></td><td><span class="player-bonus" title="Gol subiti" data-value="${p.conceded}"></span></td></tr>`).join('')}<tr><td><span class="role" data-value="all"></span><a>Coach</a></td></tr></tbody></table></li>`;
  }).join('');
  return `<html><head><link rel="canonical" href="${data.sourceUrl}"></head><body><select id="season"><option selected value="${data.season}/${String(data.season+1).slice(-2)}"></option></select><select id="matchweek"><option selected value="${data.matchday}"></option></select><ul id="match-menu">${Array.from({length:10},()=>`<li class="match"><div class="match-pill" data-match-status="${status}"></div></li>`).join('')}</ul><ul>${tables}</ul></body></html>`;
}
