import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules, teamRules, rulesText, validRules } from '../src/rules.mjs';
import { createTeam } from '../src/import-team.mjs';
import { buildRequest } from '../src/analysis.mjs';
import { isValidState } from '../src/storage.mjs';
test('old teams get all 18 default rules without altering saved players', () => {
 const old = {id:'old',name:'Old',formation:'3-4-3',players:[]};
 assert.equal(teamRules(old).length,18);
 assert.match(rulesText(old), /almeno 4 difensori/);
 assert.match(rulesText(old), /Portiere imbattuto: \+1/);
 assert.equal(old.rules,undefined);
 assert.ok(isValidState({teams:[old]}));
});
test('rules belong to each team and survive serialization', () => {
 const a=createTeam({name:'A',listSource:'leghe'},()=> 'a');
 const b=createTeam({name:'B',listSource:'fantamaster'},()=> 'b');
 a.rules[0]='12 squadre.';
 assert.equal(b.rules[0],'10 squadre.');
 assert.equal(defaultRules()[0],'10 squadre.');
 const restored=JSON.parse(JSON.stringify({teams:[a,b]}));
 assert.ok(isValidState(restored));
 assert.equal(restored.teams[0].rules[0],'12 squadre.');
 assert.equal(validRules(['invalid']),false);
});
test('AI uses edited team rules and omits disabled rules', () => {
 const team=createTeam({name:'A',listSource:'leghe'},()=> 'a');
 team.rules[0]='12 squadre.';
 team.rules[13]='';
 const input=JSON.parse(buildRequest(team,'','').input);
 assert.match(input.regolamento,/12 squadre/);
 assert.doesNotMatch(input.regolamento,/Portiere imbattuto/);
 assert.match(input.regolamento,/Modificatore difesa/);
 assert.match(input.regolamento,/Giocatore \(vs Avversaria\)/);
});
