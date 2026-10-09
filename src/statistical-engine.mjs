import {FORMATIONS,ROLES,validateLineup} from './lineup.mjs';
import {defaultRules,teamRules} from './rules.mjs';
import {staleReason} from './research.mjs';
export const ENGINE_ID='statistical-engine';
export function engineDeadlinePassed(research,now=Date.now()){
  // Legacy snapshots lack the full official round deadline: refresh before engine use.
  return !research?.roundStartsAt||!Number.isFinite(Date.parse(research.roundStartsAt))||Date.parse(research.roundStartsAt)<=now;
}
export const ENGINE_VERSION='1.0';
const clubKey=value=>{const key=String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return ({'ac milan':'milan','parma calcio 1913':'parma','hellas verona':'verona'}[key]??key);};
const round=n=>Math.round(n*10)/10;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function engineRules(team){
  const rules=teamRules(team),defaults=defaultRules();
  // League size, auction credits and roster limits do not affect matchday scoring.
  // Validate only the formation, substitution, modifier and scoring rules.
  for(let i=3;i<14;i++)if(i!==4&&rules[i]!==defaults[i])throw new Error(`Statistical engine: regola ${i+1} non supportata. Ripristina il profilo classico predefinito.`);
  const match=/^Massimo ([0-5]) sostituzioni per giornata\.$/.exec(rules[4]);
  if(!match)throw new Error('Statistical engine: limite sostituzioni non supportato (0–5).');
  return {maxSubs:Number(match[1]),formations:Object.keys(FORMATIONS),goal:3,assist:1,yellow:.5,red:1,cleanSheet:1};
}
export function seededRandom(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const poisson=(rate,rng)=>{let p=1,k=0,limit=Math.exp(-rate);do{k++;p*=rng();}while(p>limit&&k<15);return k-1;};
export function playerForecast(player,research){
  const obs=research.players.find(p=>p.id===player.id)?.observations??[];
  const value=f=>obs.find(o=>o.field===f)?.value;
  const num=f=>{const v=value(f);if(v===undefined||!/^\d+(?:[.,]\d+)?$/.test(String(v)))return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null;};
  const rated=clamp(num('rated')??0,0,50),prior={P:.002,D:.035,C:.12,A:.27}[player.role];
  const vote=clamp(((num('vote')??6)*rated+6*8)/(rated+8),4,8);
  const us=research.understat?.players.find(p=>p.rosterId===player.id);
  const u=us&&!us.reason&&us.player?.clubs?.length===1?us.player:null;
  const minutes=u?clamp(u.minutes,0,5000):0;
  const goal=u&&Number.isFinite(u.npxgPer90)?(u.npxgPer90*minutes+prior*900)/(minutes+900):((num('goals')??0)+prior*8)/(rated+8);
  const assist=u&&Number.isFinite(u.xaPer90)?(u.xaPer90*minutes+.08*900)/(minutes+900):((num('assists')??0)+.08*8)/(rated+8);
  const starting=String(value('starting')??'').toLowerCase();
  // Editorial labels inform a conservative prior, never copied as vote probabilities.
  const availability=String(value('availability')??'').toLowerCase();
  const participation=/squalifica|indisponibil|non disponibile/.test(availability)?0:/infortunio|infortunat|dubbio/.test(availability)?.4:/titolare/.test(starting)?.9:/panchina/.test(starting)?.55:.75;
  return {id:player.id,role:player.role,club:clubKey(player.club),vote,participation,goal:clamp(goal,0,.8),assist:clamp(assist,0,.5),yellow:clamp(((num('yellow')??0)+.2*8)/(rated+8),0,.7),red:clamp(((num('red')??0)+.02*8)/(rated+8),0,.15),opponent:clubKey(value('opponent')),kickoff:value('kickoff'),rated,missing:!rated};
}
export function defensiveModifier(outcomes){const d=outcomes.filter(o=>o.role==='D'&&o.rated),p=outcomes.find(o=>o.role==='P'&&o.rated);if(d.length<4||!p)return 0;const avg=(p.vote+d.map(o=>o.vote).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0))/4;return avg>=6.5?3:avg>=6?1:0;}
export function scoreCandidate(candidate,scenario,forecasts,rules){
  let changes=0;const used=new Set(),actual=[];
  for(const id of candidate.starters){let o=scenario[id];if(!o.rated&&changes<rules.maxSubs){const sub=candidate.bench.find(b=>!used.has(b)&&forecasts[b].role===forecasts[id].role&&scenario[b].rated);if(sub){used.add(sub);changes++;o=scenario[sub];}}actual.push(o);}
  const modifier=defensiveModifier(actual);
  return {total:actual.reduce((s,o)=>s+(o.rated?o.vote+o.bonus-o.malus:0),0)+modifier,modifier,actual};
}
export function candidateLineups(players,forecasts,rules){
  const groups=Object.fromEntries(Object.keys(ROLES).map(role=>[role,players.filter(p=>p.role===role).sort((a,b)=>{const score=p=>forecasts[p.id].participation*(forecasts[p.id].vote+3*forecasts[p.id].goal+forecasts[p.id].assist);return score(b)-score(a)||a.id.localeCompare(b.id);}).map(p=>p.id)]));
  const complete=rules.formations.filter(f=>Object.entries(FORMATIONS[f]).every(([r,n])=>groups[r].length>=n));
  const formations=complete.length?complete:rules.formations.slice().sort((a,b)=>Object.entries(FORMATIONS[b]).reduce((s,[r,n])=>s+Math.min(n,groups[r].length),0)-Object.entries(FORMATIONS[a]).reduce((s,[r,n])=>s+Math.min(n,groups[r].length),0)).slice(0,1);
  const candidates=[];
  for(const formation of formations){
    const starters=Object.keys(ROLES).flatMap(r=>groups[r].slice(0,FORMATIONS[formation][r]));
    const make=ids=>({formation,starters:ids,bench:Object.keys(ROLES).flatMap(r=>groups[r].filter(id=>!ids.includes(id)))});
    candidates.push(make(starters));
    const variants=Object.keys(ROLES).map(role=>{
      const selected=starters.filter(id=>forecasts[id].role===role),options=[];
      // Starter alternatives come before bench-order variations within each role.
      for(const out of (players.length<=14?selected:selected.slice(-2)))for(const incoming of groups[role].filter(id=>!starters.includes(id)).slice(0,2))options.push(make(starters.map(id=>id===out?incoming:id)));
      for(const c of [make(starters),...options.slice()]){
        const same=c.bench.filter(id=>forecasts[id].role===role);
        if(same.length>1){const bench=[...c.bench],a=bench.indexOf(same[0]),b=bench.indexOf(same[1]);[bench[a],bench[b]]=[bench[b],bench[a]];options.push({...c,bench});}
      }
      return options;
    });
    // Round-robin prevents goalkeeper/defender choices consuming the attacker budget.
    for(let round=0,added=0;added<16&&variants.some(v=>round<v.length);round++)for(const options of variants)if(options[round]&&added<16){candidates.push(options[round]);added++;}
  }
  return candidates;
}

export function fixtureForecasts(list,research){
  const teams=research.understat?.teams??[],fixtures=research.understat?.fixtures??[];
  const shrunk=s=>s&&Number.isFinite(s.xgPerMatch)&&Number.isFinite(s.xgaPerMatch)&&Number.isInteger(s.games)&&s.games>0?{attack:(s.xgPerMatch*s.games+1.25*8)/(s.games+8),defense:(s.xgaPerMatch*s.games+1.25*8)/(s.games+8)}:null;
  const entries=list.flatMap(f=>{
    const own=teams.filter(t=>clubKey(t.name)===f.club),opp=teams.filter(t=>clubKey(t.name)===f.opponent);
    const matches=own.length===1&&opp.length===1?fixtures.filter(g=>!g.completed&&((g.homeId===own[0].id&&g.awayId===opp[0].id)||(g.awayId===own[0].id&&g.homeId===opp[0].id))&&Math.abs(Date.parse(g.kickoff)-Date.parse(f.kickoff))<3600000):[];
    const fixture=matches.length===1?matches[0]:null,home=fixture?.homeId===own[0]?.id;
    const a=fixture?shrunk(home?own[0].home:own[0].away):null,b=fixture?shrunk(home?opp[0].away:opp[0].home):null;
    const id=fixture?.id??`fallback:${[f.club,f.opponent].sort().join(':')}:${f.kickoff}`;
    return [[f.club,{id,rate:clamp(a&&b?(a.attack+b.defense)/2:1.25,.35,3.5),fallback:!a||!b,opponent:f.opponent}],[f.opponent,{id,rate:clamp(a&&b?(b.attack+a.defense)/2:1.25,.35,3.5),fallback:!a||!b,opponent:f.club}]];
  });return Object.fromEntries(entries);
}
export function effectiveKeeperParticipation(list){
  const result=list.map(f=>({...f})),clubs=new Set(result.filter(f=>f.role==='P').map(f=>f.club));
  for(const club of clubs){
    const keepers=result.filter(f=>f.role==='P'&&f.club===club).sort((a,b)=>(b.rawParticipation??b.participation)-(a.rawParticipation??a.participation)||a.id.localeCompare(b.id));
    let remaining=1;
    for(const keeper of keepers){keeper.rawParticipation=keeper.rawParticipation??keeper.participation;keeper.participation=remaining*keeper.rawParticipation;remaining-=keeper.participation;}
  }
  return result;
}
export function sampleScenario(list,rng,rules,fixtures={}){
  list=effectiveKeeperParticipation(list);
  const clubs=new Map();for(const f of list){if(!clubs.has(f.club))clubs.set(f.club,[]);clubs.get(f.club).push(f);}
  const scored=new Map(),conceded=new Map();for(const club of clubs.keys())scored.set(club,poisson(fixtures[club]?.rate??1.25,rng));
  const keeperRated=new Set();
  for(const team of clubs.values()){const keepers=team.filter(f=>f.role==='P').sort((a,b)=>b.rawParticipation-a.rawParticipation||a.id.localeCompare(b.id));let draw=rng();for(const f of keepers){draw-=f.participation;if(draw<0){keeperRated.add(f.id);break;}}}
  const scenario={};for(const f of list){if(!conceded.has(f.club))conceded.set(f.club,scored.get(f.opponent)??poisson(fixtures[f.opponent]?.rate??1.25,rng));const rated=f.role==='P'?keeperRated.has(f.id):rng()<f.participation;scenario[f.id]={role:f.role,rated,vote:clamp(f.vote+(rng()+rng()+rng()-1.5)*1.1,3,9),bonus:0,malus:rated?(rng()<f.yellow?rules.yellow:0)+(rng()<f.red?rules.red:0):0};if(rated&&f.role==='P'){scenario[f.id].malus+=conceded.get(f.club);if(!conceded.get(f.club))scenario[f.id].bonus+=rules.cleanSheet;}}
  for(const [club,team]of clubs){for(let i=0;i<scored.get(club);i++){let scorer=null;for(const [field,points]of [['goal',rules.goal],['assist',rules.assist]]){
    // Fixed total-squad reference rate. Incomplete roster leaves events to unowned players.
    const weights=team.map(f=>scenario[f.id].rated&&!(field==='assist'&&f.id===scorer)?f[field]/1.25:0),sum=weights.reduce((a,b)=>a+b,0),scale=Math.max(1,sum);let draw=rng();for(let j=0;j<team.length;j++){draw-=weights[j]/scale;if(draw<0){scenario[team[j].id].bonus+=points;if(field==='goal')scorer=team[j].id;break;}}}}}
  return scenario;
}
export function storedEngineMetadata(data){
  if(data?.version!==ENGINE_VERSION||!Number.isSafeInteger(data.seed)||data.seed<0||data.seed>4294967295||!Number.isInteger(data.simulations)||data.simulations<100||data.simulations>2000||!Number.isInteger(data.candidates)||data.candidates<1||data.candidates>136||![data.expected,data.p10,data.p90,data.threshold66].every(Number.isFinite)||[data.expected,data.p10,data.p90].some(n=>n< -100||n>300)||data.p10>data.expected||data.p90<data.expected||data.threshold66<0||data.threshold66>1||!Number.isInteger(data.missing)||data.missing<0||data.missing>40)throw new Error('Metadati Statistical engine non validi.');
  return Object.fromEntries(['version','seed','simulations','candidates','expected','p10','p90','threshold66','missing'].map(k=>[k,data[k]]));
}
export async function analyzeStatistical({team,research,matchday='',signal,now=new Date(),seed=20261009,simulations=1000,onProgress=()=>{}}){
  const reason=staleReason(research,team,matchday,now.getTime());if(reason)throw new Error(reason);
  if(!team.players.length||team.players.length>40||new Set(team.players.map(p=>p.id)).size!==team.players.length||team.players.some(p=>!Object.hasOwn(ROLES,p.role)))throw new Error('Statistical engine richiede una rosa Classic valida (massimo 40 giocatori).');
  if(!Number.isInteger(simulations)||simulations<100||simulations>2000||!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw new Error('Parametri simulazione non validi.');
  if(engineDeadlinePassed(research,now.getTime()))throw new Error('Statistical engine: scadenza della giornata non verificata o giornata iniziata. Aggiorna dati.');
  const rules=engineRules(team),players=team.players.filter(p=>p.available!==false);if(!players.length)throw new Error('Nessun giocatore disponibile.');
  const list=effectiveKeeperParticipation(players.map(p=>playerForecast(p,research)));
  if(list.some(f=>!f.kickoff||!Number.isFinite(Date.parse(f.kickoff))||Date.parse(f.kickoff)<=now.getTime()))throw new Error('Statistical engine: orari futuri non verificati per tutta la rosa disponibile. Aggiorna dati prima della consegna; non si analizzano giornate iniziate.');
  const fixtures=fixtureForecasts(list,research);
  const forecasts=Object.fromEntries(list.map(f=>[f.id,f])),candidates=candidateLineups(players,forecasts,rules),rng=seededRandom(seed),scenarios=[];
  const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));const check=()=>signal?.throwIfAborted();
  for(let i=0;i<simulations;i++){check();scenarios.push(sampleScenario(list,rng,rules,fixtures));if(i%50===0){onProgress(`Statistical engine: scenari ${i+1}/${simulations}`);await yieldUI();}}
  const results=[];for(let i=0;i<candidates.length;i++){check();const c=candidates[i],scores=scenarios.map(s=>scoreCandidate(c,s,forecasts,rules)),values=scores.map(s=>s.total).sort((a,b)=>a-b);results.push({c,scores,expected:values.reduce((a,b)=>a+b,0)/simulations,p10:values[Math.floor(simulations*.1)],p90:values[Math.floor(simulations*.9)],threshold66:values.filter(v=>v>=66).length/simulations});if(i%4===0){onProgress(`Statistical engine: confronto ${i+1}/${candidates.length}`);await yieldUI();}}
  check();results.sort((a,b)=>b.expected-a.expected);const best=results[0],lineup=best.c;validateLineup(lineup,team.players);
  const average=fn=>best.scores.reduce((s,v)=>s+fn(v),0)/simulations;
  // Each slot includes its replacement's realized points; a missing vote contributes zero.
  const forecastPlayers=lineup.starters.map((id,i)=>({id,vote:average(s=>s.actual[i].rated?s.actual[i].vote:0),bonus:average(s=>s.actual[i].rated?s.actual[i].bonus:0),malus:average(s=>s.actual[i].rated?s.actual[i].malus:0),reason:`Stima dello slot inclusa la copertura. Base voto puro ${round(forecasts[id].vote)}; segnale gol ${round(forecasts[id].goal)} e assist ${round(forecasts[id].assist)} per impiego pieno, ridotti verso prior di ruolo. Riserva: ${lineup.bench.filter(b=>forecasts[b].role===forecasts[id].role).map(b=>players.find(p=>p.id===b).name).slice(0,2).join(', ')||'nessuna'}. Prior di voto ${(forecasts[id].participation*100).toFixed(0)}%, ipotesi non calibrata; ${forecasts[id].rated} presenze a voto disponibili. Voto puro separato dai bonus; fantamedia non sommata.`}));
  const expected=forecastPlayers.reduce((s,p)=>s+p.vote+p.bonus-p.malus,0)+average(s=>s.modifier);
  const assumptions='Priors non calibrati: voto 6 con 8 presenze equivalenti; attacco per ruolo, 900 minuti equivalenti per xG/xA; partecipazione da etichette editoriali, non percentuali copiate. Gol squadra Poisson da xG/xGA casa-trasferta ridotti verso 1,25 con 8 partite equivalenti (fallback 1,25), indipendenti fra squadre; portieri stesso club: al massimo uno a voto, il preferito conserva il proprio prior, le riserve coprono il residuo con i propri prior condizionali; nessuna distribuzione storica individuale. Rigori e malus speciali non stimati separatamente. Quando le quote dei giocatori della stessa squadra superano il totale disponibile, vengono ridotte insieme; in quel caso la copertura della rosa influisce sulle stime. Sostituzioni stesso ruolo nell’ordine P/D/C/A, senza cambio modulo. Le componenti mostrate includono la riserva nello slot e il rischio senza voto.';
  const metadata=storedEngineMetadata({version:ENGINE_VERSION,seed,simulations,candidates:candidates.length,expected:round(best.expected),p10:Math.min(best.p10,round(best.expected)),p90:Math.max(best.p90,round(best.expected)),threshold66:best.threshold66,missing:list.filter(f=>f.missing).length});
  const alternative=results[1];
  const switched=alternative?lineup.starters.filter(id=>!alternative.c.starters.includes(id)):[];
  const comparison=switched.slice(0,2).map(id=>{const f=forecasts[id],name=players.find(p=>p.id===id).name,other=alternative.c.starters.find(b=>!lineup.starters.includes(b)&&forecasts[b].role===f.role);return `${name}: voto di base ${round(f.vote)}, possibilità di voto stimata ${Math.round(f.participation*100)}%${other?`; ${players.find(p=>p.id===other).name}: ${round(forecasts[other].vote)}, ${Math.round(forecasts[other].participation*100)}%`:''}. Questi valori sono ipotesi conservative basate sui dati disponibili, non fatti di fonte.`;}).join(' ');
  const text=`Modulo: ${lineup.formation}\n\nStatistical engine: migliore formazione fra le alternative valutate; ricerca limitata, senza garanzia di ottimo globale. La scelta valuta insieme punti, rischio senza voto, copertura della panchina e modificatore difesa. ${alternative?`Alternativa più vicina ${alternative.c.formation}: ${round(alternative.expected)} fp (differenza ${round(best.expected-alternative.expected)}). Cambiano ${lineup.starters.filter(id=>!alternative.c.starters.includes(id)).map(id=>players.find(p=>p.id===id).name).join(', ')||'le priorità della panchina'}; differenze piccole restano incerte.`:''} ${comparison}\n\nCopertura: ${metadata.missing}/${list.length} giocatori senza presenze storiche utilizzabili. ${new Set(list.filter(f=>fixtures[f.club].fallback).map(f=>f.club)).size} club senza confronto Understat verificato: stima conservativa di 1,25 gol squadra. Nuove notizie di impiego possono cambiare la scelta. Copertura formazione: ${lineup.starters.length}/11 posti coperti. Ricerca ${research.completedAt}. Nessuna chiamata AI o costo provider.`;
  return {method:ENGINE_ID,engine:metadata,lineup,forecast:{players:forecastPlayers,modifier:average(s=>s.modifier),modifierReason:'Media del bonus applicato in ogni scenario dopo i cambi: almeno 4 difensori a voto, portiere e migliori 3 difensori; +1 a 6, +3 a 6,5.',low:round(Math.min(best.p10,expected)),high:round(Math.max(best.p90,expected)),assumptions},text,sources:research.sources.map(({id,url,title})=>({id,url,title}))};
}
