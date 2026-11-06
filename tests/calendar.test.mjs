import test from 'node:test';
import assert from 'node:assert/strict';
import {nextMatchday} from '../src/calendar.mjs';
import {collectCalendar,normalizeCalendar,handleCalendar,CALENDAR_URL} from '../server/serie-a-calendar.mjs';
const now=new Date('2026-10-08T15:00:00Z');
const round=n=>Array.from({length:10},(_,i)=>({matchday:n,home:`Home ${i}`,away:`Away ${i}`,kickoff:`2026-10-${n===6?'10':'17'}T16:00:00Z`,status:'UPCOMING'}));
const calendar=fixtures=>({version:1,season:2026,retrievedAt:now.toISOString(),fixtures});
test('official matchday ignores a started round with postponed fixtures',()=>{
 assert.equal(nextMatchday(calendar(round(6)),now).matchday,'6');
 const fixtures=round(6);fixtures[0].status='FINISHED';
 assert.equal(nextMatchday(calendar([...fixtures,...round(7)]),now).matchday,'7');
 assert.throws(()=>nextMatchday(calendar(fixtures),now),/Nessuna prossima/);
});
test('unknown kickoff, incomplete and stale calendar cannot silently select a later round',()=>{
 const fixtures=round(6);fixtures[0].kickoff=null;
 assert.throws(()=>nextMatchday(calendar([...fixtures,...round(7)]),now),/Nessuna prossima/);
 assert.throws(()=>nextMatchday(calendar(round(6).slice(1)),now),/Nessuna prossima/);
 assert.throws(()=>nextMatchday({...calendar(round(6)),retrievedAt:'2026-10-07T15:00:00Z'},now),/scaduto/);
});
test('public widget season is extracted without executing scripts and other seasons are rejected',async()=>{
 const id='serie-a::Football_Season::'+'a'.repeat(32),calls=[];
 const data={competition:{name:'Serie A',seasonName:'2026/2027'},matches:round(6).map(m=>({matchSet:{name:'Matchday 6'},home:{shortName:m.home},away:{shortName:m.away},matchDateUtc:m.kickoff,status:m.status}))};
 const result=await collectCalendar({now,fetchImpl:async url=>{calls.push(url);return url===CALENDAR_URL?new Response(`seasonIds\\":[\\"${id}\\"]`):Response.json(data);}});
 assert.equal(result.fixtures.length,10);assert.equal(calls.length,2);assert.ok(calls[1].endsWith(encodeURIComponent(id)+'/matches'));
 assert.throws(()=>normalizeCalendar({...data,competition:{name:'Serie A',seasonName:'2025/2026'}},now),/non verificabile/);
});
test('calendar relay rejects custom URLs, foreign origins and mutations',async()=>{
 for(const [url,init,status] of [['https://app.example/api/calendar?url=other',{},400],['https://app.example/api/calendar',{method:'POST'},405],['https://app.example/api/calendar',{headers:{origin:'https://other.example'}},403]]){
  assert.equal((await handleCalendar(new Request(url,init),{fetchImpl:()=>{throw Error('must not fetch');}})).status,status);
 }
});
