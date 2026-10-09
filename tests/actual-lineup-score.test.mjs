import test from 'node:test';
import assert from 'node:assert/strict';
import {actualLineupScore} from '../server/actual-lineup-score.mjs';
import {parseMatchdayVotes,collectMatchdayVotes} from '../server/matchday-votes.mjs';
import {comparisonWinner,renderComparisonCards} from '../src/comparison-ui.mjs';
import {historyFixture,voteHTML} from './fixtures/history.mjs';
const voteFor=(f,id)=>f.votes.players.find(p=>p.id===f.record.players.find(p=>p.id===id).fantacalcioId);
test('actual totals use published matchday fantasy votes, add keeper clean sheet once and apply pure-vote modifier',()=>{
  const f=historyFixture();assert.equal(actualLineupScore(f.record,f.votes).total,68);
  voteFor(f,'A0').fantasyVote=9;voteFor(f,'D0').fantasyVote=5.5;
  const result=actualLineupScore(f.record,f.votes);assert.equal(result.total,70.5);assert.equal(result.modifier,1);assert.equal(result.goals,1);
  for(const id of ['P0','D0','D1','D2']){voteFor(f,id).vote=6.5;voteFor(f,id).fantasyVote=6.5;}
  const higher=actualLineupScore(f.record,f.votes);assert.equal(higher.modifier,3);
  voteFor(f,'P0').fantasyVote=4.5;voteFor(f,'P0').conceded=2;
  assert.equal(actualLineupScore(f.record,f.votes).players[0].points,4.5);
});
test('substitutions use the archived role and priority, obey the cap and leave unfilled slots at zero',()=>{
  const f=historyFixture();voteFor(f,'P0').status='unrated';voteFor(f,'D0').status='unrated';voteFor(f,'D4').vote=7;voteFor(f,'D4').fantasyVote=10;
  f.record.rules[4]='Massimo 1 sostituzioni per giornata.';
  let r=actualLineupScore(f.record,f.votes);assert.deepEqual(r.substitutions,[{out:'P0',in:'P1'}]);assert.equal(r.players[1].rated,false);assert.equal(r.modifier,0);assert.equal(r.total,61);
  f.record.recommendation.lineup.starters.reverse();assert.deepEqual(actualLineupScore(f.record,f.votes).substitutions,[{out:'P0',in:'P1'}]);
  f.record.rules[4]='Massimo 5 sostituzioni per giornata.';r=actualLineupScore(f.record,f.votes);assert.deepEqual(r.substitutions,[{out:'P0',in:'P1'},{out:'D0',in:'D4'}]);assert.equal(r.total,72);assert.equal(r.modifier,1);
  f.record.rules[4]='Massimo 0 sostituzioni per giornata.';r=actualLineupScore(f.record,f.votes);assert.equal(r.total,54);assert.equal(r.modifier,0);assert.deepEqual(r.substitutions,[]);
});
test('two roster entries matching the same real player cannot be counted twice',()=>{
  const f=historyFixture();f.record.players.find(p=>p.id==='D1').fantacalcioId=f.record.players.find(p=>p.id==='D0').fantacalcioId;
  assert.equal(actualLineupScore(f.record,f.votes).status,'pending');
});
test('missing identity, ambiguous names and special S.V. remain pending; stable absent IDs become no vote',()=>{
  const f=historyFixture();f.record.players.find(p=>p.id==='D4').fantacalcioId=null;
  f.votes.players=f.votes.players.filter(p=>p.name!=='Giocatore D4');assert.equal(actualLineupScore(f.record,f.votes).status,'complete');
  voteFor(f,'D0').status='unrated';assert.equal(actualLineupScore(f.record,f.votes).status,'pending');
  const fresh=historyFixture();fresh.votes.players=fresh.votes.players.filter(p=>p.id!==fresh.record.players.find(p=>p.id==='A0').fantacalcioId);
  assert.deepEqual(actualLineupScore(fresh.record,fresh.votes).substitutions,[{out:'A0',in:'A3'}]);
  voteFor(fresh,'P0').status='unknown';assert.equal(actualLineupScore(fresh.record,fresh.votes).status,'pending');
});
test('unfinished matches, wrong rounds and unsupported saved rules cannot produce a winner',()=>{
  const f=historyFixture();f.votes.complete=false;assert.equal(actualLineupScore(f.record,f.votes).status,'pending');
  f.votes.matchday=9;assert.throws(()=>actualLineupScore(f.record,f.votes),/coerente/);f.votes.matchday=8;
  f.record.rules[13]='Portiere imbattuto: +2 punti.';assert.equal(actualLineupScore(f.record,f.votes).status,'unsupported');
});
test('vote parser validates the exact season and round, first editorial provider, coaches and no-vote sentinels',()=>{
  const f=historyFixture();voteFor(f,'A0').status='unrated';const html=voteHTML(f.votes),parsed=parseMatchdayVotes(html,2026,8);
  assert.equal(parsed.complete,true);assert.equal(parsed.players.length,41);assert.equal(parsed.players.find(p=>p.name==='Giocatore A0').status,'unrated');
  assert.equal(actualLineupScore(f.record,parsed).status,'complete');assert.throws(()=>parseMatchdayVotes(html,2025,8));assert.throws(()=>parseMatchdayVotes(html,2026,9));
  assert.equal(parseMatchdayVotes(voteHTML(f.votes,{status:'3'}),2026,8).complete,false);
  assert.throws(()=>parseMatchdayVotes(html.replace('title="Redazione Fantacalcio"','title="Unknown provider"'),2026,8));
  const malformed=html.replace('data-value="6"','data-value="999"');assert.equal(parseMatchdayVotes(malformed,2026,8).players[0].status,'unknown');
});
test('vote collector bounds downloads, rejects redirects and upstream errors without falling back to averages',async()=>{
  const f=historyFixture(),html=voteHTML(f.votes);let url,options;
  const parsed=await collectMatchdayVotes(2026,8,{useCache:false,fetchImpl:async(u,o)=>{url=u;options=o;return new Response(html);}});assert.equal(parsed.complete,true);assert.equal(url,f.votes.sourceUrl);assert.equal(options.redirect,'error');
  await assert.rejects(collectMatchdayVotes(2026,8,{useCache:false,fetchImpl:async()=>new Response('not available',{status:404})}));
  await assert.rejects(collectMatchdayVotes(2026,8,{useCache:false,fetchImpl:async()=>new Response('x'.repeat(4000001))}));
});
test('comparison handles ties and excludes late, incomplete or differently configured suggestions; escapes stored text',()=>{
  const f=historyFixture(),result=actualLineupScore(f.record,f.votes);
  const a={method:'deepseek',record:f.record,actual_result:result},b={method:'kimi',record:structuredClone(f.record),actual_result:{...result,total:70}};
  assert.deepEqual(comparisonWinner([a,b]),['kimi']);b.actual_result.total=result.total;assert.deepEqual(comparisonWinner([a,b]),['deepseek','kimi']);
  b.actual_result.late=true;assert.deepEqual(comparisonWinner([a,b]),[]);b.actual_result.late=false;b.record.rules[4]='Massimo 1 sostituzioni per giornata.';assert.deepEqual(comparisonWinner([a,b]),[]);
  b.record.rules=f.record.rules;b.actual_result.status='pending';assert.deepEqual(comparisonWinner([a,b]),[]);
  f.record.recommendation.text='<script>alert(1)</script>';const output=renderComparisonCards([a]);assert.ok(output.includes('&lt;script&gt;'));assert.ok(!output.includes('<script>'));assert.ok(output.includes('Nessuna proposta salvata'));
  f.record.recommendation.createdAt=f.record.roundStartsAt;assert.equal(actualLineupScore(f.record,f.votes).late,true);
});
