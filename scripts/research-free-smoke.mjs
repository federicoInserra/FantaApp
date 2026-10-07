// Explicit, free live verification. No API keys, Tavily or Fireworks requests.
// Usage: node scripts/research-free-smoke.mjs /path/to/team.txt
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {collectFantacalcio} from '../server/fantacalcio-source.mjs';
import {normalizeLeague,understatSnapshot,seasonAt} from '../src/understat.mjs';
import {primaryObservations} from '../src/primary-research.mjs';
const path=process.argv[2];if(!path)throw new Error('Pass a roster TXT path');
const text=await readFile(path,'utf8');
const players=text.split(/\r?\n/).flatMap(line=>{const m=/^([PDCA])\s*-\s*(.+?)\s*\((.+)\)\s*$/.exec(line);return m?[{id:String(line),role:m[1],name:m[2],club:m[3]}]:[];});
if(!players.length)throw new Error('No players');
const now=new Date(),season=seasonAt(now);
const response=await fetch(`https://understat.com/getLeagueData/Serie_A/${season}`,{headers:{'X-Requested-With':'XMLHttpRequest'},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error(`Understat HTTP ${response.status}`);
const understat=understatSnapshot(normalizeLeague(await response.json(),season,now),players,now);
const primary=await collectFantacalcio({now});
const result=primaryObservations(primary,{players},understat,'',now);
const report={createdAt:now.toISOString(),paidCalls:0,understat:understat.players.map(p=>({name:p.name,matched:p.player?.name,reason:p.reason})),...result};
await mkdir('research-results',{recursive:true});await writeFile('research-results/free-research.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({coverage:result.coverage,understat:report.understat,warnings:result.warnings},null,2));
