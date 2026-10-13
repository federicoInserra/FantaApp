import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonRankings,comparisonWinner,COMPARISON_METHODS} from '../src/comparison-rankings.mjs';
import {renderRankings,renderComparisonCards} from '../src/comparison-ui.mjs';
import {actualLineupScore} from '../server/actual-lineup-score.mjs';
import {historyFixture} from './fixtures/history.mjs';
const item=(method,total,day=6,season=2026)=>({method,season,matchday:day,rules:Array(14).fill('same'),actual_result:{status:'complete',total,late:true,checkedAt:'2026-10-13T12:00:00Z',provider:'Fantacalcio',sourceUrl:`https://example.test/${season}/${day}`}});
const row=(rows,method)=>rows.find(r=>r.method===method);
test('rankings sum all complete predictions across seasons and award one point to every tied winner',()=>{
  const history=[item('deepseek',73),item('kimi',75),item('federico',70),item('deepseek',80,7),item('kimi',80,7),item('deepseek',60,6,2027)];
  const rows=comparisonRankings(history);assert.equal(rows.length,5);
  assert.deepEqual(row(rows,'deepseek'),{method:'deepseek',label:'DeepSeek',total:213,scored:3,wins:1,compared:2});
  assert.equal(row(rows,'kimi').wins,2);assert.equal(row(rows,'kimi').total,155);assert.equal(row(rows,'federico').wins,0);
  assert.equal(row(rows,'chatgpt').scored,0);assert.equal(row(rows,'chatgpt').total,0);
  assert.deepEqual(comparisonRankings(history),rows);
});
test('pending, unsupported and inconsistent rounds do not award premature wins; single-method scores count in totals',()=>{
  const pending=item('kimi',100);pending.actual_result.status='pending';
  let rows=comparisonRankings([item('deepseek',70),pending]);assert.equal(row(rows,'deepseek').total,70);assert.equal(row(rows,'deepseek').wins,0);assert.equal(row(rows,'kimi').scored,0);
  for(const status of ['pending','unsupported']){pending.actual_result.status=status;assert.deepEqual(comparisonWinner([item('deepseek',70),pending]),[]);}
  const different=item('kimi',80);different.rules[4]='different';assert.equal(row(comparisonRankings([item('deepseek',70),different]),'kimi').wins,0);
  const nan=item('kimi',NaN);assert.equal(row(comparisonRankings([nan]),'kimi').scored,0);
  const snapshot=item('kimi',80);snapshot.actual_result.checkedAt='older';assert.deepEqual(comparisonWinner([item('deepseek',70),snapshot]),[]);
});
test('all five methods tied at 80.5 each earn one win, including legacy late flags',()=>{
  const history=COMPARISON_METHODS.map(m=>item(m.id,80.5));
  assert.equal(comparisonWinner(history).length,5);
  assert.ok(comparisonRankings(history).every(r=>r.total===80.5&&r.wins===1&&r.compared===1));
});
test('standings render two tables with tied positions, sample counts and no deadline exclusion',()=>{
  const rows=comparisonRankings([item('deepseek',70),item('kimi',75),item('chatgpt',75)]),html=renderRankings(rows);
  assert.equal((html.match(/<table>/g)||[]).length,2);assert.match(html,/Fantapunti totali/);assert.match(html,/Vittorie di giornata/);assert.match(html,/Confronti/);assert.equal((html.match(/<td>1<\/td><th scope="row">(?:Kimi|ChatGPT)/g)||[]).length,4);
  const f=historyFixture();f.record.recommendation.createdAt=f.record.roundStartsAt;
  const cards=renderComparisonCards([{method:'deepseek',record:f.record,actual_result:actualLineupScore(f.record,f.votes)}]);
  assert.doesNotMatch(cards,/Fuori termine|esclusa dalla valutazione/);
  rows[0].label='<script>';assert.match(renderRankings(rows),/&lt;script&gt;/);
});
