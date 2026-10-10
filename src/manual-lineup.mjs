import {FORMATIONS,ROLES,validateLineup} from './lineup.mjs';
import {buildRequest} from './analysis.mjs';
import {analysisFingerprint} from './analysis-state.mjs';
import {staleReason} from './research.mjs';
import {isManualMethod,recommendationLabel} from './recommendation-methods.mjs';
const available=(team,role)=>team.players.filter(p=>p.role===role&&p.available!==false);
const roles=Object.keys(ROLES);
export function manualContextReason(team,matchday=team.research?.matchday??'',now=Date.now()) {
  const reason=staleReason(team.research,team,matchday,now);if(reason)return reason;
  const day=/^(?:giornata\s*)?(\d{1,2})(?:[ª°])?$/i.exec(matchday.trim()),season=team.research?.understat?.season;
  if(!day||Number(day[1])<1||Number(day[1])>38||!Number.isInteger(season)||season<2000||season>2200||!team.research?.roundStartsAt)return 'Aggiorna i dati per verificare stagione, giornata e scadenza prima di salvare.';
  return '';
}
export function createManualDraft(team,lineup=null) {
  if(lineup){try{validateLineup(lineup,team.players);}catch{lineup=null;}}
  const formation=lineup?.formation??team.formation??'4-3-3',slots=FORMATIONS[formation]??FORMATIONS['4-3-3'];
  const draft={formation:Object.hasOwn(FORMATIONS,formation)?formation:'4-3-3',starters:{},bench:{},notes:'',dirty:false};
  for(const role of roles){
    draft.starters[role]=Array.from({length:slots[role]},(_,i)=>lineup?.starters.filter(id=>team.players.find(p=>p.id===id)?.role===role)[i]??null);
    const bench=lineup?.bench.filter(id=>team.players.find(p=>p.id===id)?.role===role)??[];
    draft.bench[role]=Array.from({length:Math.max(bench.length,available(team,role).length-slots[role],0)},(_,i)=>bench[i]??null);
  }
  return draft;
}
export function changeManualFormation(draft,team,formation) {
  if(!Object.hasOwn(FORMATIONS,formation))throw Error('Modulo non supportato.');
  const next=structuredClone(draft);next.formation=formation;next.dirty=true;
  for(const role of roles){
    const n=FORMATIONS[formation][role],old=draft.starters[role],bench=draft.bench[role].filter(Boolean);
    const starters=old.slice(0,n);
    while(starters.length<n)starters.push(bench.shift()??null);
    const reserves=[...old.slice(n).filter(Boolean),...bench];
    next.starters[role]=starters;
    next.bench[role]=Array.from({length:Math.max(reserves.length,available(team,role).length-n,0)},(_,i)=>reserves[i]??null);
  }
  return next;
}
export function selectManualPlayer(draft,team,{section,role,index},id) {
  if(!['starters','bench'].includes(section)||!roles.includes(role)||!Number.isInteger(index)||index<0||index>=draft[section][role].length)throw Error('Posizione non valida.');
  if(id!==null&&!available(team,role).some(p=>p.id===id))throw Error('Scegli un giocatore disponibile dello stesso ruolo.');
  if(id!==null)for(const part of ['starters','bench'])for(const r of roles){const other=draft[part][r].indexOf(id);if(other>=0&&(part!==section||r!==role||other!==index))throw Error('Giocatore già selezionato. Svuota prima la sua posizione sul campo o in panchina.');}
  const next=structuredClone(draft);
  next[section][role][index]=id;next.dirty=true;return next;
}
export function manualPlayerChoices(team,draft,role) {
  const selected=new Set(['starters','bench'].flatMap(part=>roles.flatMap(r=>draft[part][r])).filter(Boolean));
  return available(team,role).filter(player=>!selected.has(player.id)).map(player=>({player}));
}
export function manualLineup(draft,team) {
  const lineup={formation:draft.formation,starters:roles.flatMap(r=>draft.starters[r].filter(Boolean)),bench:roles.flatMap(r=>draft.bench[r].filter(Boolean))};
  try{validateLineup(lineup,team.players);}catch{throw Error('Completa i posti del modulo con giocatori disponibili, senza duplicati. Se la rosa è incompleta, riempi tutti i posti possibili per ruolo.');}
  return lineup;
}
export function importChatGPTLineup(text,team,previousDraft) {
  if(typeof text!=='string'||!text.trim())throw Error('Incolla la risposta JSON di ChatGPT.');
  if(text.length>100000)throw Error('La risposta è troppo lunga (massimo 100.000 caratteri).');
  // Accept copied JSON, a complete Markdown code block or triple-quote wrappers.
  const json=text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').replace(/^"{3,}\s*([\s\S]*?)\s*"{3,}$/,'$1');
  let result;try{result=JSON.parse(json);}catch{throw Error('JSON non valido. Copia l’intero oggetto da { a }, senza altri commenti.');}
  if(!result||Array.isArray(result)||typeof result!=='object'||typeof result.formation!=='string'||!Object.hasOwn(FORMATIONS,result.formation))throw Error('La risposta deve contenere un modulo supportato nel campo formation.');
  if(!Array.isArray(result.starters)||!Array.isArray(result.bench)||result.starters.length>11||result.bench.length>100||[...result.starters,...result.bench].some(id=>typeof id!=='string'||!id||id.length>150))throw Error('La risposta deve contenere starters e bench come elenchi di ID giocatore.');
  const ids=[...result.starters,...result.bench];
  if(new Set(ids).size!==ids.length)throw Error('Un giocatore compare più volte tra titolari e panchina. Correggi gli ID duplicati.');
  const byId=new Map(team.players.map(p=>[p.id,p]));
  const unknown=ids.find(id=>!byId.has(id));if(unknown)throw Error(`Il giocatore ${unknown} non è nella rosa selezionata. Verifica di aver usato il prompt di questa squadra.`);
  const unavailable=ids.find(id=>byId.get(id).available===false);if(unavailable)throw Error(`Il giocatore ${byId.get(unavailable).name} non è disponibile. Correggi la risposta o aggiorna la rosa.`);
  const lineup={formation:result.formation,starters:result.starters,bench:result.bench};
  try{validateLineup(lineup,team.players);}catch{throw Error('I titolari non rispettano i ruoli e il numero di posti del modulo. Verifica la risposta di ChatGPT.');}
  // Extra response fields do not become AI forecasts or costs on a manual record.
  const draft=createManualDraft(team,lineup);
  draft.notes=previousDraft?.notes??'';draft.chatgptResponse=text;draft.dirty=true;
  return draft;
}
export function copyRecommendationPrompt(team,matchday=team.research?.matchday??'',now=new Date()) {
  const reason=manualContextReason(team,matchday,now.getTime());if(reason)throw Error(reason);
  const request=buildRequest(team,matchday,'',now,team.research);
  // Exactly the instructions and input strings used by both hosted recommendation models.
  return {text:request.instructions+'\n\n'+request.input,createdAt:now.toISOString(),researchId:team.research.id,teamFingerprint:analysisFingerprint(team),matchday};
}
export function buildManualRecommendation({team,method,draft,matchday=team.research?.matchday??'',prompt=null,now=new Date(),id=crypto.randomUUID()}) {
  if(!isManualMethod(method))throw Error('Metodo manuale non supportato.');
  const reason=manualContextReason(team,matchday,now.getTime());if(reason)throw Error(reason);
  const lineup=manualLineup(draft,team),fingerprint=analysisFingerprint(team);
  if(method==='chatgpt'&&prompt&&(prompt.researchId!==team.research.id||prompt.teamFingerprint!==fingerprint||prompt.matchday!==matchday))throw Error('I dati sono cambiati dopo la copia del prompt. Copialo di nuovo e verifica la formazione ChatGPT.');
  const byId=new Map(team.players.map(p=>[p.id,p]));
  const names=ids=>ids.map(id=>`${byId.get(id).name} (${byId.get(id).club})`).join(', ');
  const text=[`Modulo: ${lineup.formation}`, ...roles.map(role=>`${ROLES[role]}: ${names(lineup.starters.filter(id=>byId.get(id).role===role))||'Posto mancante'}`),`Panchina (priorità per ruolo): ${names(lineup.bench)||'Nessuna riserva'}`,'',method==='chatgpt'?'Formazione ChatGPT trascritta manualmente. Nessuna richiesta AI dall’app.':'Formazione scelta personalmente da Federico.',draft.notes?.trim()??''].filter(Boolean).join('\n');
  return {version:2,id,method,text,notes:draft.notes?.trim()??'',lineup,createdAt:now.toISOString(),researchId:team.research.id,researchAt:team.research.completedAt,teamFingerprint:fingerprint,matchday,sources:team.research.sources.map(({id,url,title})=>({id,url,title})),...(method==='chatgpt'&&prompt?{promptCopiedAt:prompt.createdAt}:{})};
}
