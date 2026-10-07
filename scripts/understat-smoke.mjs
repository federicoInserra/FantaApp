// Explicit live test. Never auto-discovered by node --test; no paid APIs or secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { handleRequest } from '../worker/understat-worker.mjs';
import { normalizeLeague, seasonAt, understatSnapshot } from '../src/understat.mjs';
const now=new Date(),season=seasonAt(now);
const response=await handleRequest(new Request(`http://localhost/api/understat?season=${season}`));
if(!response.ok)throw new Error(`Understat HTTP ${response.status}`);
const raw=await response.json(),league=normalizeLeague(raw.data,season,new Date(raw.retrievedAt));
const roster=[['Maignan','Milan'],['Barella','Inter'],['Lucca','Napoli'],['Esposito S','Sassuolo']].map(([name,club],i)=>({id:String(i),name,club}));
const snapshot=understatSnapshot(league,roster,now);
await mkdir('research-results',{recursive:true});await writeFile('research-results/understat-live.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({season,players:league.players.length,teams:league.teams.length,fixtures:league.fixtures.length,next14Days:snapshot.fixtures.length,matches:snapshot.players.map(p=>({name:p.name,matched:p.player?.name,reason:p.reason,minutes:p.player?.minutes,npxgPer90:p.player?.npxgPer90,xaPer90:p.player?.xaPer90})),latestMatchAt:league.latestMatchAt},null,2));
