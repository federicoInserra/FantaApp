import assert from 'node:assert/strict';
import test from 'node:test';
import { FORMATIONS, playerScore, suggestLineup } from '../src/lineup.mjs';

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
