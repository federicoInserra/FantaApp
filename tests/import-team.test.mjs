import test from 'node:test';
import assert from 'node:assert/strict';
import { appendImportedTeam, parseTeamText, MAX_IMPORT_BYTES } from '../src/import-team.mjs';
import { isValidState } from '../src/storage.mjs';
import { analyzeSquad } from '../src/analysis.mjs';
const text = "Squadra: Squadra test\n\nP - Portiere (Milan)\nD - Carlos Augusto (Inter)\nC - Calo' (Frosinone)\nA - Castro S (Roma)";

test('TXT preserves supplied names, roles and clubs without a catalog or invented statistics', () => {
 const payload = parseTeamText(text);
 assert.equal(payload.name, 'Squadra test');
 assert.deepEqual(payload.players.map(p => [p.name, p.club, p.role]), [['Portiere','Milan','P'],['Carlos Augusto','Inter','D'],["Calo'",'Frosinone','C'],['Castro S','Roma','A']]);
 assert.ok(payload.players.every(p => p.form === null && p.vote === null && p.available && !p.catalogId));
});
test('accepts UTF-8 BOM, CRLF, blank lines, accents and dash variants', () => {
 const payload = parseTeamText('\uFEFF\r\nSquadra: Città\r\n\r\np – Nicolò (Club)\r\nD — Altro (Club)\r\n');
 assert.equal(payload.players[0].name, 'Nicolò');
 assert.equal(payload.players[0].role, 'P');
});
test('invalid and duplicate lines fail with their original line number', () => {
 assert.throws(() => parseTeamText('Test\nP - Name (Club)'), /prima riga/);
 assert.throws(() => parseTeamText('Squadra: Test'), /non contiene/);
 assert.throws(() => parseTeamText('Squadra: Test\n\nX - Name (Club)'), /Riga 3/);
 assert.throws(() => parseTeamText('Squadra: Test\nP - Name ()'), /Riga 2/);
 assert.throws(() => parseTeamText('Squadra: Test\nP - Name (Club)\nD - name (CLUB)'), /Riga 3.*più volte/);
 assert.throws(() => parseTeamText('Squadra: Test\nP - Name (Club)\nnot a player'), /Riga 3/);
 assert.throws(() => parseTeamText('x'.repeat(MAX_IMPORT_BYTES + 1)), /64 KB/);
 assert.throws(() => parseTeamText('Squadra: Test\n'+Array.from({length:41},(_,i)=>`P - Name ${i} (Club)`).join('\n')), /40 giocatori/);
});
test('import saves valid independent squads, blocks duplicate files, and allows reimport after deletion', () => {
 const state = { teams: [{ id: 'existing', name: 'Altro', formation: '3-4-3', players: [] }], activeTeamId: 'existing' };
 const payload = parseTeamText(text);
 const result = appendImportedTeam(state, payload, () => 'new');
 assert.equal(result.team.importedFrom, 'txt');
 assert.equal(result.team.listSource, undefined);
 assert.equal(state.activeTeamId, 'new');
 assert.ok(isValidState(state));
 result.team.players[0].available = false;
 assert.equal(payload.players[0].available, true);
 result.team.name = 'Modificata';
 assert.equal(appendImportedTeam(state, payload, () => 'duplicate').added, false);
 const reordered = parseTeamText('Squadra: SQUADRA TEST\n'+text.split('\n').slice(2).reverse().join('\n'));
 assert.equal(reordered.key, payload.key);
 state.teams.pop();
 assert.equal(appendImportedTeam(state, payload, () => 'again').added, true);
});
test('TXT squads can use AI without selecting a catalog', async () => {
 const state = { teams: [] };
 const { team } = appendImportedTeam(state, parseTeamText(text), () => 'new');
 let called = false;
 await assert.rejects(analyzeSquad({key:'test',team,fetchImpl:async () => {called=true; return {ok:false,status:403};}}), /Accesso negato/);
 assert.equal(called,true);
});
