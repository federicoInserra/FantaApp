// Explicit live test. Never auto-discovered by node --test; no paid APIs or secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { handleRequest } from '../worker/understat-worker.mjs';
import { fetchUnderstat, seasonAt, understatSnapshot } from '../src/understat.mjs';
const now=new Date(),season=seasonAt(now);
const league=await fetchUnderstat({serviceURL:'http://localhost',season,now,fetchImpl:url=>handleRequest(new Request(url))});
const roster=[['Maignan','Milan'],['Barella','Inter'],['Lucca','Napoli'],['Esposito S','Sassuolo']].map(([name,club],i)=>({id:String(i),name,club}));
const snapshot=understatSnapshot(league,roster,now);
await mkdir('research-results',{recursive:true});await writeFile('research-results/understat-live.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({provider:league.provider,season,updatedAt:league.updatedAt,players:league.players.length,teams:league.teams.length,fixtures:league.fixtures.length,next14Days:snapshot.fixtures.length,matches:snapshot.players.map(p=>({name:p.name,matched:p.player?.name,reason:p.reason,minutes:p.player?.minutes,npxgPer90:p.player?.npxgPer90,xaPer90:p.player?.xaPer90})),latestMatchAt:league.latestMatchAt},null,2));
