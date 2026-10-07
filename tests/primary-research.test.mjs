import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseStats,parseLineups,handleFantacalcio,STATS_URL,LINEUPS_URL} from '../server/fantacalcio-source.mjs';
import {primaryObservations,fetchPrimary} from '../src/primary-research.mjs';
import {matchSquad} from '../src/understat.mjs';
const statsHTML=await readFile(new URL('./fixtures/fantacalcio-stats.html',import.meta.url),'utf8');
const lineupsHTML=await readFile(new URL('./fixtures/fantacalcio-lineups.html',import.meta.url),'utf8');
const now=new Date('2026-10-07T15:00:00Z');
const data=()=>({version:1,season:2026,retrievedAt:now.toISOString(),players:parseStats(statsHTML,2026),matches:parseLineups(lineupsHTML,2026),warnings:[]});
const squad={players:[{id:'d',name:'Delprato',club:'Parma',role:'D'},{id:'t',name:'Torriani',club:'Milan',role:'P'},{id:'k',name:'Kelly',club:'Juventus',role:'D'},{id:'e',name:'Esposito S',club:'Sassuolo',role:'A'}]};
const understat={season:2026,sourceUrl:'https://understat.com/league/Serie_A/2026',retrievedAt:now.toISOString(),teams:[{id:'i',name:'Inter'},{id:'p',name:'Parma Calcio 1913'}],fixtures:[{id:'1',homeId:'i',awayId:'p',completed:false,kickoff:'2026-10-10T16:00:00Z'}]};
test('actual labelled HTML preserves zero appearances and missing averages; schema changes reject',()=>{
 const rows=data().players,d=rows.find(p=>p.name==='Delprato'),t=rows.find(p=>p.name==='Torriani');
 assert.equal(d.stats.rated,5);assert.equal(d.stats.vote,6);assert.equal(d.stats.fantamedia,5.8);assert.equal(t.stats.rated,0);assert.equal(t.stats.vote,null);assert.equal(t.stats.fantamedia,null);
 assert.throws(()=>parseStats(statsHTML,2025));assert.throws(()=>parseStats(statsHTML.replace('>PV<','>Appearances<'),2026));
 assert.throws(()=>parseStats(statsHTML.replace('data-col-key="mfv"','data-col-key="other"'),2026));
 assert.throws(()=>parseLineups(lineupsHTML,2025));
});
test('names and initials match only within club, preserve ambiguity and separate goalkeepers',()=>{
 const input=data(),result=primaryObservations(input,squad,understat,'',now);assert.equal(result.coverage.statistics,4);
 input.players.push({...input.players.find(p=>p.name==='Delprato'),id:'duplicate'});
 assert.equal(primaryObservations(input,squad,understat,'',now).players[0].observations.length,0);
 assert.equal(primaryObservations(data(),{players:[{...squad.players[0],club:'Inter'}]},understat,'',now).coverage.statistics,0);
});
test('current forecasts require requested matchday AND a future matching fixture; absence is not availability',()=>{
 const result=primaryObservations(data(),squad,understat,'6',now),obs=result.players[0].observations;
 assert.ok(obs.some(o=>o.field==='starting'&&o.kind==='forecast'));assert.ok(obs.some(o=>o.field==='opponent'&&o.value==='Inter'));
 assert.ok(!obs.some(o=>o.field==='availability'));
 for(const day of ['7','next Sunday'])assert.ok(!primaryObservations(data(),squad,understat,day,now).players[0].observations.some(o=>o.field==='starting'));
 const old=data();old.matches[0].updatedAt='01/09/2026 - 12:00';assert.equal(primaryObservations(old,squad,understat,'',now).coverage.starting,0);
 assert.equal(primaryObservations(data(),squad,{...understat,fixtures:[]},'',now).coverage.starting,0);
 assert.equal(primaryObservations(data(),squad,{...understat,fixtures:[{...understat.fixtures[0],completed:true}]},'',now).coverage.starting,0);
});
test('Understat fixes Del Prato and never assigns Filippo to goalkeeper Pietro Terracciano',()=>{
 const league={teams:[{id:'p',name:'Parma Calcio 1913',overall:{games:5,xg:1,xga:1}},{id:'m',name:'AC Milan',overall:{games:5,xg:1,xga:1}}],players:[{id:'6692',name:'Enrico Del Prato',teamIds:['p'],minutes:450,npxg:0.13,xa:0.07},{id:'8512',name:'Filippo Terracciano',teamIds:['m'],minutes:1,npxg:0,xa:0}]};
 assert.equal(matchSquad(league,[squad.players[0]])[0].player.id,'6692');
 assert.equal(matchSquad(league,[{id:'t',name:'Terracciano',club:'Milan',role:'P'}])[0].player,null);
 assert.equal(matchSquad(league,[{...squad.players[0],club:'Milan'}])[0].player,null);
 league.players.push({...league.players[0],id:'999'});assert.match(matchSquad(league,[squad.players[0]])[0].reason,/ambiguo/);
});
test('free relay uses fixed sources, no credentials, bounded HTML, partial lineup failure and no paid fallback',async()=>{
 let calls=0;const fetchImpl=async(url,options)=>{calls++;assert.ok([STATS_URL,LINEUPS_URL].includes(url));assert.equal(options.headers.Authorization,undefined);return new Response(url===STATS_URL?statsHTML:lineupsHTML);};
 const request=new Request('https://app.example/api/fantacalcio',{headers:{Authorization:'do-not-forward'}});
 const response=await handleFantacalcio(request,{fetchImpl,now,cache:false});assert.equal(response.status,200);assert.equal(calls,2);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const partial=await handleFantacalcio(request,{fetchImpl:async url=>new Response(url===STATS_URL?statsHTML:'broken'),now,cache:false});assert.equal(partial.status,200);assert.equal((await partial.json()).warnings.length,1);
 const bad=await handleFantacalcio(request,{fetchImpl:async()=>new Response('x'.repeat(4_000_001)),now,cache:false});assert.equal(bad.status,502);
 assert.equal((await handleFantacalcio(new Request(request.url+'?url=https://evil.example'),{fetchImpl,now})).status,400);
 await assert.rejects(fetchPrimary({serviceURL:'https://app.example',now,fetchImpl:async()=>Response.json({...data(),retrievedAt:'2026-01-01'})}),/scaduta/);
});
