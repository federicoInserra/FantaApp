import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseResponse, analyzeSquad, ENDPOINT } from '../src/analysis.mjs';
import { squadSignature } from '../src/research.mjs';
const team = { name: 'Test', listSource: 'leghe', players: [{ id: '1', name: 'Player', role: 'A', club: 'Club', form: 10, vote: 10, available: false }] };
const research = {createdAt:new Date().toISOString(), signature:squadSignature(team),matchday:'',understat:{provider:'Understat'},players:[{observations:[{}]}],sources:[{id:'S1',url:'https://example.com',title:'Fonte'}]};
const complete = { status: 'completed', output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Consiglio', annotations: [{ type: 'url_citation', url: 'https://example.com', title: 'Fonte' }, { type: 'url_citation', url: 'javascript:alert(1)' }] }] }] };
test('request requires research and excludes demo statistics', () => {
 const request = buildRequest(team, '8', 'Modificatore difesa');
 assert.equal(request.store, false);
 assert.equal(request.tools, undefined);
 const input = JSON.parse(request.input);
 assert.equal(input.rosa[0].disponibile, false);
 assert.equal(input.rosa[0].form, undefined);
 assert.equal(input.rosa[0].vote, undefined);
 assert.equal(input.giornata, '8');
 assert.equal(input.regolamento, 'Modificatore difesa');
});
test('unresearched and incomplete answers are rejected', () => {
 assert.equal(parseResponse({ ...complete, output: complete.output.slice(1) },research).text,'Consiglio');
 assert.throws(() => parseResponse({ ...complete, status: 'incomplete' }), /non completata/);
 assert.equal(parseResponse(complete,research).sources.length, 1);
});
test('key goes only in authorization header to fixed Fireworks endpoint', async () => {
 const result = await analyzeSquad({ key: 'test-secret', team, research, fetchImpl: async (url, options) => {
  assert.equal(url, ENDPOINT);
  assert.equal(options.headers.Authorization, 'Bearer test-secret');
  assert.ok(!options.body.includes('test-secret'));
  return { ok: true, json: async () => complete };
 } });
 assert.equal(result.text, 'Consiglio');
});
test('access errors do not expose provider response or key', async () => {
 await assert.rejects(analyzeSquad({ key: 'test-secret', team, research, fetchImpl: async () => ({ ok: false, status: 403, json: () => { throw new Error('must not read provider error'); } }) }), /Accesso negato/);
});
test('empty and demo squads never make requests', async () => {
 const fetchImpl = () => { throw new Error('should not call'); };
 await assert.rejects(analyzeSquad({ key: 'x', team: { ...team, players: [] }, fetchImpl }), /giocatori/);
 await assert.rejects(analyzeSquad({ key: 'x', team: { ...team, listSource: undefined }, fetchImpl }), /rosa reale/);
});
test('analysis receives structured Understat data and blocks an older snapshot without it',async()=>{
 const data={...research,understat:{provider:'Understat',players:[{rosterId:'1',player:{npxgPer90:0.45}}],teams:[{id:'club',overall:{xgaPerMatch:1.2}}]}};
 const input=JSON.parse(buildRequest(team,'','',new Date(),data).input);assert.deepEqual(input.raccolta.understat,data.understat);
 await assert.rejects(analyzeSquad({key:'test-secret',team,research:{...research,understat:undefined},fetchImpl:()=>{throw new Error('must not call');}}),/Understat/);
});
