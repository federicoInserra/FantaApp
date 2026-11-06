import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {recommendationView} from '../src/analysis-presentation.mjs';
import {DEFAULT_MODEL,estimateUsage} from '../src/ai-models.mjs';
import {lineup,forecastFor} from './fixtures/lineup.mjs';
const rec={lineup,forecast:forecastFor(lineup),model:DEFAULT_MODEL,text:'Modulo: 4-3-3\nPortieri: Player\n\nPrima scelta motivata.\n\nSeconda scelta motivata.',createdAt:'2026-10-08T12:00:00Z',researchAt:'2026-10-08T11:00:00Z',matchday:'6',sources:[{id:'F1',title:'Statistiche',url:'https://www.fantacalcio.it/statistiche-serie-a'}],aiUsage:estimateUsage(DEFAULT_MODEL,{input_tokens:10000,output_tokens:5000})};
test('proposal highlights the saved values and retains the complete original and source without mutating it',()=>{
 const before=structuredClone(rec),$=load(recommendationView(rec,false));
 assert.equal($('.ai-result-text p').length,2);assert.equal($('.ai-result-text').text(),'Prima scelta motivata.Seconda scelta motivata.');
 assert.equal($('.proposal-original').text(),rec.text);assert.match($('.proposal-metrics').text(),/71,4/);assert.match($('.proposal-cost').text(),/0,0055/);
 assert.equal($('a').attr('href'),rec.sources[0].url);assert.notEqual($('#recommendation-stale').attr('hidden'),undefined);assert.deepEqual(rec,before);
});
test('legacy and ordinary text remains complete and missing cost is never presented as a zero estimate',()=>{
 for(const text of ['Legacy advice without a structured summary','Modulo: unchanged prose without a separator','First paragraph\n\nSecond paragraph']){
  const $=load(recommendationView({...rec,text,lineup:undefined,forecast:undefined,aiUsage:undefined},true));
  assert.equal($('.proposal-original').text(),text);assert.equal($('.ai-result-text').text(),text.replace(/\n\n/g,''));
  assert.equal($('.proposal-cost').text(),'—');assert.equal($('#recommendation-stale').attr('hidden'),undefined);
 }
});
test('model text, dates, source titles and original summaries cannot inject active markup',()=>{
 const bad={...rec,text:'Modulo: <img src=x>\n\n<script>bad()</script>',matchday:'<img src=x>',sources:[{...rec.sources[0],title:'<script>bad()</script>'}]};
 const $=load(recommendationView(bad,false));assert.equal($('script,img').length,0);assert.match($('.ai-result-text').text(),/<script>/);assert.equal($('.proposal-original').text(),bad.text);
});
