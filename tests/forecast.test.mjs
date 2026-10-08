import test from 'node:test';
import assert from 'node:assert/strict';
import {storedForecast,forecastTotals,predictedPoints} from '../src/forecast.mjs';
import {lineup,forecastFor} from './fixtures/lineup.mjs';
test('team projection adds starter votes and bonuses, subtracts penalties and adds the modifier exactly once',()=>{
 const raw=forecastFor(lineup);raw.expected=999;raw.players[0].secret='secret';raw.secret='secret';
 const saved=storedForecast(raw,lineup);
 assert.deepEqual(forecastTotals(saved),{vote:66,bonus:5.5,malus:1.1,modifier:1,expected:71.4});
 assert.equal(predictedPoints(saved.players[0]),6.4);assert.equal(saved.players.length,11);assert.ok(!JSON.stringify(saved).includes('secret'));assert.equal(saved.expected,undefined);
});
test('missing or duplicated starters, reserve IDs, malformed estimates and contradictory ranges fail as a whole',()=>{
 const valid=forecastFor(lineup);
 for(const bad of [undefined,{...valid,players:valid.players.slice(1)},{...valid,players:valid.players.map((p,i)=>i===0?{...p,id:'A3'}:p)},{...valid,players:valid.players.map((p,i)=>i===1?valid.players[0]:p)},...['vote','bonus','malus'].flatMap(field=>[NaN,Infinity,'6',-1,31].map(value=>({...valid,players:valid.players.map((p,i)=>i===0?{...p,[field]:value}:p)}))),{...valid,low:80},{...valid,high:60},{...valid,low:Infinity},{...valid,modifier:'1'},{...valid,modifierReason:''},{...valid,assumptions:'x'.repeat(3001)},{...valid,players:valid.players.map(p=>({...p,reason:''}))}])assert.throws(()=>storedForecast(bad,lineup),/Previsione DeepSeek non valida/);
});
test('rounding is applied once to each stored component and incomplete squads do not get phantom points',()=>{
 const partial={...lineup,starters:['P0']},forecast=forecastFor(partial);forecast.players[0].vote=6.234;forecast.players[0].bonus=0.456;forecast.players[0].malus=0.124;
 const saved=storedForecast(forecast,partial);assert.equal(forecastTotals(saved).expected,6.6);assert.equal(saved.players.length,1);
});
