import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPlayerAnalysis} from '../src/player-analysis.mjs';
import {analysisFingerprint} from '../src/analysis-state.mjs';
import {squadSignature} from '../src/research.mjs';
import {players,lineup,forecastFor} from './fixtures/lineup.mjs';
const now=Date.parse('2026-10-08T12:00:00Z'),options={now,matchday:'8',fromPitch:true};
function team(){
 const t={name:'Team',formation:lineup.formation,listSource:'leghe',players:structuredClone(players)};
 t.research={id:'r',createdAt:new Date(now).toISOString(),completedAt:new Date(now).toISOString(),signature:squadSignature(t),matchday:'8',players:[{id:'D0',observations:[{field:'vote',value:'6.7',sourceId:'F1',period:'2026/2027',kind:'fact'},{field:'starting',value:'90% editoriale',sourceId:'F1',period:'Giornata 8',kind:'forecast'}]}],sources:[{id:'F1',title:'Statistiche',url:'https://www.fantacalcio.it/statistiche-serie-a'}],understat:{provider:'Understat',season:2026,sourceUrl:'https://understat.com/league/Serie_A/2026',players:[{rosterId:'D0',player:{name:'Player',clubs:['Inter'],minutes:450,npxgPer90:0.12,xaPer90:0.04}}]}};
 t.recommendation={lineup,forecast:forecastFor(lineup),createdAt:new Date(now).toISOString(),researchId:'r',teamFingerprint:analysisFingerprint(t),matchday:'8'};
 return t;
}
test('selected player shows AI reason and prediction separately from real source statistics and Understat',()=>{
 const html=renderPlayerAnalysis(team(),'D0',options);
 assert.match(html,/Perché titolare/);assert.match(html,/Scelto per media voto/);assert.match(html,/6,4 fp/);assert.match(html,/>6.7</);assert.match(html,/450/);assert.match(html,/0,12/);assert.match(html,/2026\/2027/);assert.match(html,/Previsione editoriale/);assert.match(html,/https:\/\/www.fantacalcio.it/);
});
test('legacy proposals and missing statistics are explicit; another player never receives this player’s statistics',()=>{
 const t=team();delete t.recommendation.forecast;
 assert.match(renderPlayerAnalysis(t,'D0',options),/Genera una nuova proposta/);
 const html=renderPlayerAnalysis(t,'A3',options);assert.match(html,/Nessuna statistica Fantacalcio/);assert.match(html,/Understat non disponibili/);assert.doesNotMatch(html,/>6.7</);
 delete t.research;assert.match(renderPlayerAnalysis(t,'D0',options),/Aggiorna i dati/);
});
test('a different matchday or manual draft cannot claim an AI selection reason or prediction',()=>{
 const t=team();assert.doesNotMatch(renderPlayerAnalysis(t,'D0',{...options,matchday:'9'}),/6,4 fp|Scelto per media voto/);
 t.formation='3-4-3';assert.match(renderPlayerAnalysis(t,'D0',options),/bozza indicativa/);
});
test('provider text and selection reasons are escaped and never become markup',()=>{
 const t=team();t.recommendation.forecast.players.find(p=>p.id==='D0').reason='<img src=x onerror=bad>';t.research.players[0].observations[0].value='<script>bad</script>';
 const html=renderPlayerAnalysis(t,'D0',options);assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);
});
