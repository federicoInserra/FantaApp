import assert from 'node:assert/strict';
import test from 'node:test';
import { FORMATIONS, playerScore, suggestLineup, validateLineup } from '../src/lineup.mjs';
import {players,lineup} from './fixtures/lineup.mjs';

test('every formation has eleven valid slots', () => {
  for (const slots of Object.values(FORMATIONS)) {
    assert.deepEqual(Object.keys(slots), ['P', 'D', 'C', 'A']);
    assert.equal(Object.values(slots).reduce((sum, count) => sum + count, 0), 11);
  }
});

test('suggestion picks the strongest available players for each role', () => {
  const players = [
    { id: 'p1', role: 'P', name: 'Portiere', form: 7, vote: 7, available: true },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `d${index}`, role: 'D', name: `Difensore ${index}`, form: index + 4, vote: 7, available: true })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, role: 'C', name: `Centrocampista ${index}`, form: index + 4, vote: 7, available: true })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `a${index}`, role: 'A', name: `Attaccante ${index}`, form: index + 4, vote: 7, available: true })),
  ];
  players.find(player => player.id === 'a3').available = false;
  const result = suggestLineup(players, '3-4-3');
  assert.equal(result.complete, true);
  assert.deepEqual(result.starters.D.map(player => player.id), ['d4', 'd3', 'd2']);
  assert.deepEqual(result.starters.A.map(player => player.id), ['a2', 'a1', 'a0']);
  assert.ok(playerScore(result.starters.D[0]) > playerScore(result.starters.D[1]));
});

test('missing slots are reported when a role cannot be filled', () => {
  const result = suggestLineup([{ id: '1', role: 'P', name: 'P', form: 7, vote: 7 }], '4-4-2');
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, { P: 0, D: 4, C: 4, A: 2 });
});
test('AI IDs preserve the chosen starters and bench order rather than score sorting',()=>{
  const selected=validateLineup(lineup,players);
  assert.equal(selected.complete,true);
  assert.deepEqual(selected.starters.D.map(p=>p.id),['D0','D1','D2','D3']);
  assert.deepEqual(selected.bench.map(p=>p.id),lineup.bench);
  assert.notDeepEqual(selected.starters.D.map(p=>p.id),suggestLineup(players,'4-3-3').starters.D.map(p=>p.id));
});
test('unknown IDs, absent players, duplicates, wrong role counts and missing starters are rejected',()=>{
  for(const bad of [
    {...lineup,formation:'2-5-3'},
    {...lineup,starters:lineup.starters.map(id=>id==='P0'?'Other':id)},
    {...lineup,bench:['A3','A3']},
    {...lineup,bench:['P0']},
    {...lineup,starters:lineup.starters.map(id=>id==='D3'?'C3':id)},
    {...lineup,starters:lineup.starters.slice(1)},
  ])assert.throws(()=>validateLineup(bad,players),/non valida/);
  assert.throws(()=>validateLineup(lineup,players.map(p=>({...p,available:p.id!=='A3'}))),/non valida/);
  assert.throws(()=>validateLineup({...lineup,formation:'5-4-1',starters:['P0','D0','D1','D2','D3','C0','C1','C2','C3','A0']},players.filter(p=>!['D4','D5'].includes(p.id))),/non valida/);
});
test('a genuinely incomplete squad keeps available starters and reports empty slots',()=>{
  const selected=validateLineup({formation:'4-3-3',starters:['P0','D0'],bench:[]},players.filter(p=>['P0','D0'].includes(p.id)));
  assert.equal(selected.complete,false);assert.deepEqual(selected.missing,{P:0,D:3,C:3,A:3});
});
