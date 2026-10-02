import test from 'node:test';
import assert from 'node:assert/strict';
import { appendImportedTeam, encodeImportFragment, decodeImportFragment, importKey, validateImport } from '../src/import-team.mjs';

const payload = { v: 1, name: 'fantaMaster', source: 'fantamaster', ids: ['fm:1', 'fm:2'] };
payload.key = importKey(payload.name, payload.source, payload.ids);

test('import link round-trips a catalog-only payload and rejects arbitrary stats', () => {
  const { key, ...linkPayload } = payload;
  const url = `https://example.test/FantaApp/${encodeImportFragment(linkPayload)}`;
  const decoded = decodeImportFragment(new URL(url).hash);
  assert.deepEqual(decoded, payload);
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(new URL(url).hash.slice(8), 'base64url').toString())), ['v', 'name', 'source', 'ids']);
  assert.throws(() => validateImport({ ...payload, vote: 10 }), /non valido/i);
  assert.throws(() => validateImport({ ...payload, ids: ['fm:1', 'fm:1'] }), /non valido/i);
});

test('an import key makes repeated imports idempotent and leaves edits intact', () => {
  const state = { teams: [{ id: 'existing', name: 'Altro', formation: '3-4-3', players: [] }], activeTeamId: 'existing' };
  const catalog = payload.ids.map((id, index) => ({ id, name: `Giocatore ${index}`, club: 'Club', role: 'D', quotation: 1 }));
  const first = appendImportedTeam(state, payload, catalog, () => 'new');
  assert.equal(first.added, true);
  assert.equal(state.teams.length, 2);
  assert.deepEqual(state.teams[1].players.map(player => [player.form, player.vote]), [[null, null], [null, null]]);
  state.teams[1].name = 'Modificata';
  const second = appendImportedTeam(state, payload, catalog, () => 'duplicate');
  assert.equal(second.added, false);
  assert.equal(state.teams.length, 2);
  assert.equal(state.teams[1].name, 'Modificata');
});
