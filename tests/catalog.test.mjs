import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterCatalog, hasPlayer, rosterPlayer } from '../src/catalog.mjs';
import { isValidState, readState, writeState, LEGACY_KEY } from '../src/storage.mjs';
const catalogs = {};
for (const source of ['fantamaster','leghe']) catalogs[source] = JSON.parse(await readFile(new URL(`../data/${source}.json`, import.meta.url))).players;

test('imported catalogs preserve provider roles and unique IDs', () => {
  assert.equal(catalogs.fantamaster.length,583); assert.equal(catalogs.leghe.length,599);
  assert.equal(catalogs.fantamaster.find(p=>p.name==='De Ketelaere').role,'C');
  assert.equal(catalogs.leghe.find(p=>p.name==='De Ketelaere').role,'A');
  for (const players of Object.values(catalogs)) {
    assert.equal(new Set(players.map(p=>p.id)).size,players.length);
    assert.ok(players.every(p=>['P','D','C','A'].includes(p.role) && p.name && p.club));
    assert.ok(players.every(p=>!('FantaSquadra' in p) && !('Costo' in p)));
  }
});
test('search combines club/name, role and outside-list filters', () => {
  assert.equal(filterCatalog(catalogs.leghe,'de ketelaere atalanta','A').length,1);
  assert.equal(filterCatalog(catalogs.leghe,'de ketelaere','C').length,0);
  assert.equal(filterCatalog(catalogs.leghe,'','').length,535);
  assert.equal(filterCatalog(catalogs.leghe,'','',true).length,599);
});
test('roster entries retain catalog identity without inventing statistics', () => {
  const source=catalogs.leghe[0]; const player=rosterPlayer(source);
  assert.equal(player.form,null);assert.equal(player.vote,null);
  assert.equal(hasPlayer({players:[player]},source),true);
  assert.equal(hasPlayer({players:[]},source),false);
});
test('both legacy teams and list-based teams survive JSON persistence', () => {
  let raw=null;
  globalThis.localStorage={getItem:key=>raw,setItem:(key,value)=>{assert.equal(key,LEGACY_KEY);raw=value;}};
  const old={teams:[{id:'old',name:'Originale',formation:'3-4-3',players:[]}],activeTeamId:'old'};
  writeState(old);assert.deepEqual(readState(()=>{throw Error('must not reset')}),old);
  const current=structuredClone(old);current.teams[0].listSource='leghe';current.teams[0].players=[rosterPlayer(catalogs.leghe[0])];
  assert.ok(isValidState(current));writeState(current);assert.deepEqual(readState(()=>null),current);
  current.teams[0].listSource='unknown';assert.equal(isValidState(current),false);
});
