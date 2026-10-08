import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFormationLayout} from '../src/formation-view.mjs';
import {formationView,analysisFingerprint} from '../src/analysis-state.mjs';
import {squadSignature} from '../src/research.mjs';
import {players,lineup} from './fixtures/lineup.mjs';
const now=Date.parse('2026-10-08T12:00:00Z');
function team(){
  const t={name:'Team',listSource:'leghe',formation:lineup.formation,players:structuredClone(players)};
  t.research={id:'r',createdAt:new Date(now).toISOString(),signature:squadSignature(t),matchday:'8',understat:{provider:'Understat'},players:[{observations:[{}]}]};
  t.recommendation={version:2,lineup:structuredClone(lineup),researchId:'r',teamFingerprint:analysisFingerprint(t),matchday:'8'};
  return t;
}
test('the pitch shows the exact saved AI starters and ordered bench with their full roster names',()=>{
  const html=renderFormationLayout(team(),'8',now);
  assert.match(html,/PROPOSTA DEEPSEEK/);assert.match(html,/4-3-3/);assert.match(html,/11\/11/);
  const ids=[...html.matchAll(/data-player-id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,[...['A','C','D','P'].flatMap(role=>lineup.starters.filter(id=>id.startsWith(role))),...lineup.bench]);
  assert.match(html,/D Giocatore 0/);assert.doesNotMatch(html,/Punteggio demo/);
});
test('manual module changes show an explicit draft and allow restoring the saved AI suggestion',()=>{
  const t=team();t.formation='3-4-3';
  const html=renderFormationLayout(t,'8',now);
  assert.match(html,/BOZZA INDICATIVA/);assert.match(html,/modulo diverso/);assert.match(html,/restore-recommendation/);
  t.formation=lineup.formation;assert.equal(formationView(t,'8',now).ai,true);
});
test('changed matchday, roster, rules, research or expired data never displays the old AI selection as current',()=>{
  const changed=[];
  let t=team();t.players[0].available=false;changed.push(t);
  t=team();t.rules=['New rules'];changed.push(t);
  t=team();t.research.id='new';changed.push(t);
  t=team();t.research.createdAt=new Date(now-7*3600000).toISOString();changed.push(t);
  for(t of changed){assert.equal(formationView(t,'8',now).ai,false);assert.match(renderFormationLayout(t,'8',now),/proposta DeepSeek è superata/);}
  assert.equal(formationView(team(),'9',now).ai,false);
});
test('legacy text-only and malformed saved lineups stay readable without silently applying a guessed lineup',()=>{
  const t=team();delete t.recommendation.lineup;t.recommendation.version=1;
  assert.match(renderFormationLayout(t,'8',now),/solo testo/);
  t.recommendation.lineup={...lineup,bench:['Unknown']};assert.equal(formationView(t,'8',now).ai,false);
});
test('roster names are escaped in both pitch and bench',()=>{
  const t=team();t.players[0].name='<script>test</script>';t.players.find(p=>p.id==='A3').name='" onclick="bad';t.recommendation.teamFingerprint=analysisFingerprint(t);t.research.signature=squadSignature(t);
  const html=renderFormationLayout(t,'8',now);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot; onclick=&quot;bad/);
});
