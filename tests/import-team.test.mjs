import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeam, parseTeamText, MAX_IMPORT_BYTES } from '../src/import-team.mjs';
import { isValidState } from '../src/storage.mjs';
import { squadSignature } from '../src/research.mjs';
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
test('creation requires name and catalog, overrides file name and clones imported players', () => {
 const imported = parseTeamText(text);
 assert.throws(() => createTeam({name:' ',listSource:'leghe'},()=> 'id'), /nome/);
 assert.throws(() => createTeam({name:'Test',listSource:''},()=> 'id'), /listone/);
 for (const listSource of ['leghe', 'fantamaster']) {
  const team = createTeam({name:'My chosen name',listSource,imported},()=> 'id');
  assert.equal(team.name,'My chosen name');
  assert.equal(team.listSource,listSource);
  assert.equal(team.players.length,4);
  assert.ok(isValidState({teams:[team]}));
  team.players[0].available=false;
  assert.equal(imported.players[0].available,true);
 }
});
test('creation without import produces an empty squad for manual entry later', () => {
 const team=createTeam({name:'Manual',listSource:'leghe'},()=> 'id');
 assert.deepEqual(team.players,[]);
 assert.equal(team.importedFrom,undefined);
 assert.ok(isValidState({teams:[team]}));
});
test('imported squad uses the selected catalog for AI', async () => {
 const team=createTeam({name:'Test',listSource:'fantamaster',imported:parseTeamText(text)},()=> 'id');
 let called=false;
 await assert.rejects(analyzeSquad({key:'test',team,research:{createdAt:new Date().toISOString(),signature:squadSignature(team),matchday:'',understat:{provider:'Understat'},players:[{observations:[{}]}],sources:[]},fetchImpl:async (url,options)=> {
  called=true;
  assert.equal(JSON.parse(JSON.parse(options.body).input).listone,'fantamaster');
  return {ok:false,status:403};
 }}), /Accesso negato/);
 assert.equal(called,true);
});
