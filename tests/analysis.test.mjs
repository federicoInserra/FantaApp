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
 assert.equal(request.max_output_tokens, 131072);
 assert.deepEqual(request.reasoning, {effort:'low'});
 assert.equal(request.tools, undefined);
 const input = JSON.parse(request.input);
 assert.equal(input.rosa[0].disponibile, false);
 assert.equal(input.rosa[0].form, undefined);
 assert.equal(input.rosa[0].vote, undefined);
 assert.equal(input.giornata, '8');
 assert.equal(input.regolamento, 'Modificatore difesa');
});
test('compact input removes repeated structured quotes but retains values, provenance and prose evidence', () => {
 const structured={field:'vote',value:'6.5',sourceId:'F1',kind:'fact',period:'2026/2027',unit:'voto',updatedAt:'2026-10-08',method:'structured',quote:'Player (Club) · 2026/2027 · vote: 6.5'};
 const prose={field:'availability',value:'In dubbio',sourceId:'F2',kind:'forecast',period:'Giornata 8',unit:'',updatedAt:'2026-10-08',method:'quote',quote:'Player resta in dubbio per la prossima partita.'};
 const data={...research,players:[{...team.players[0],observations:[structured,prose],missing:['starting']}]};
 const before=structuredClone(data);
 const input=JSON.parse(buildRequest(team,'8','',new Date(),data).input);
 const {quote,...expected}=structured;
 assert.deepEqual(input.raccolta.giocatori,[{id:'1',observations:[expected,prose],missing:['starting']}]);
 assert.deepEqual(data,before);
 assert.equal(input.rosa[0].disponibile,false);
 assert.equal(input.raccolta.giocatori[0].form,undefined);
 assert.ok(JSON.stringify(input.raccolta.giocatori).length<JSON.stringify(data.players).length);
});
test('unresearched and incomplete answers are rejected', () => {
 assert.equal(parseResponse({ ...complete, output: complete.output.slice(1) },research).text,'Consiglio');
 assert.throws(() => parseResponse({ ...complete, status: 'incomplete' }), /non completata/);
 assert.throws(() => parseResponse({ ...complete, status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'} }), /limite di token/);
 assert.throws(() => parseResponse({ ...complete, status: 'incomplete', incomplete_details: {reason: 'content_filter'} }), /filtro dei contenuti/);
 assert.equal(parseResponse(complete,research).sources.length, 1);
});
test('token-limit errors report actual usage and never expose partial answers or reasoning', () => {
 const incomplete={status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{output_tokens:36000,output_tokens_details:{reasoning_tokens:35000}},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'private partial answer'}]}]};
 assert.throws(()=>parseResponse(incomplete,research),error=>{
  assert.match(error.message,/Token generati: 36\.000 \(ragionamento: 35\.000\)/);
  assert.equal(error.message.includes('private'),false);return true;
 });
 assert.throws(()=>parseResponse({...incomplete,usage:{output_tokens:'secret'}},research),error=>!error.message.includes('secret')&&!error.message.includes('Token generati'));
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
