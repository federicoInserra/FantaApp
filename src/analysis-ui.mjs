import {AI_MODELS,DEFAULT_MODEL,modelInfo,usageLabel} from './ai-models.mjs';
import {analysisFingerprint,recommendationIsStale} from './analysis-state.mjs';
import {coverageOf} from './primary-research.mjs';
import { getAIStatus } from './ai-api.mjs';
import { HOSTED_API } from './deployment.mjs';
import { UNDERSTAT_URL_STORAGE } from './understat.mjs';
import { API_KEY_STORAGE, analyzeSquad } from './analysis.mjs';
import {askFollowUp,renderFollowUp,followUpUnavailableReason} from './follow-up.mjs';
import { TAVILY_KEY_STORAGE, researchSquad, staleReason, FIELDS } from './research.mjs';
const analyses = new Map();
let pending = null, visibleTeam, key = '', tavilyKey = '', understatURL = '';
try { key = localStorage.getItem(API_KEY_STORAGE) ?? ''; tavilyKey = localStorage.getItem(TAVILY_KEY_STORAGE) ?? ''; understatURL = localStorage.getItem(UNDERSTAT_URL_STORAGE) ?? ''; } catch { /* Legacy credentials are optional. */ }
let serverStatus = {fireworks:false,tavily:false};
const fireworksReady = () => HOSTED_API ? serverStatus.fireworks : Boolean(key);
if (HOSTED_API) {
  understatURL = location.origin;
  key = ''; tavilyKey = '';
  // Hosted deployments never reuse or upload credentials left by an older version.
  try { localStorage.removeItem(API_KEY_STORAGE); localStorage.removeItem(TAVILY_KEY_STORAGE); } catch { /* Never used even if removal fails. */ }
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let saveResult,onContextChange;
const fingerprint = analysisFingerprint;
const dateLabel = date => new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
export function setupAnalysis(options = {}) {
  saveResult=options.saveResult;
  onContextChange=options.onContextChange;
  if (HOSTED_API) {
    getAIStatus({signal:AbortSignal.timeout(10000)})
      .then(value=>{serverStatus=value;refresh();})
      .catch(()=>{serverStatus={fireworks:false,tavily:false};refresh();});
  }
}
function hydrate(team) {
  let entry=analyses.get(team.id);
  if(!entry){entry={matchday:team.research?.matchday??'',model:team.recommendation?.model??DEFAULT_MODEL};analyses.set(team.id,entry);}
  if(entry.research?.id!==team.research?.id)entry.matchday=team.research?.matchday??'';
  if(entry.recommendation?.id!==team.recommendation?.id){entry.followUpDraft='';entry.followUpError='';}
  entry.research=team.research??null;entry.recommendation=team.recommendation??null;
  return entry;
}
export function mountAnalysis(team) { visibleTeam = team; hydrate(team); refresh(); }
function understatView(data) {
  if (!data) return '';
  const n=value=>value==null ? '—' : Number(value).toLocaleString('it-IT',{maximumFractionDigits:3});
  const covered=data.players.filter(p=>p.player&&!p.reason).length;
  return `<div class="research-summary understat-summary"><strong>Understat · ${covered}/${data.players.length} giocatori con dati completi</strong><p class="field-hint">Stagione ${data.season}/${data.season+1} · Raccolta ${escape(dateLabel(data.retrievedAt))}<br>Ultima partita nei dati: ${data.latestMatchAt ? escape(dateLabel(data.latestMatchAt)) : 'nessuna'}. Statistiche storiche, non probabilità di bonus.</p><details class="research-details"><summary>Esamina statistiche Understat</summary>${data.players.map(p=>`<section class="research-player"><h3>${escape(p.name)}</h3>${p.reason?`<p class="import-error">${escape(p.reason)}</p>`:''}${p.player?`<p>${escape(p.player.name)} · ${escape(p.player.clubs.join(', '))}</p><p>${n(p.player.minutes)} minuti · ${n(p.player.games)} presenze</p><p>Totali: xG ${n(p.player.xg)} · npxG ${n(p.player.npxg)} · xA ${n(p.player.xa)} · Tiri ${n(p.player.shots)}</p><p>Per 90: npxG ${n(p.player.npxgPer90)} · xA ${n(p.player.xaPer90)}</p>`:''}</section>`).join('')}<h3>Squadre e avversarie</h3>${data.teams.map(t=>`<section class="research-player"><strong>${escape(t.name)}</strong>${[['Totale',t.overall],['Casa',t.home],['Trasferta',t.away]].map(([label,s])=>`<p>${label}: ${s.games} partite · xG ${n(s.xgPerMatch)} / xGA ${n(s.xgaPerMatch)} per partita</p>`).join('')}</section>`).join('')}<p class="field-hint">${data.fixtures.length} partite future nei prossimi 14 giorni. La giornata viene verificata con il calendario.</p><a href="https://understat.com/league/Serie_A/${data.season}" target="_blank" rel="noopener noreferrer">[U1] Apri Understat</a></details></div>`;
}
function dataView(data) {
  if (!data) return '';
  const coverage = coverageOf(data.players);
  return `<div class="research-summary"><p><strong>Fantacalcio · ${coverage.statistics}/${coverage.total} schede statistiche</strong><br><span>Ultima ricerca: ${escape(dateLabel(data.completedAt))} · salvata nel database · dati recuperati direttamente dalle fonti</span></p><p class="field-hint">Media voto e fantamedia: ${coverage.averages}/${coverage.total} · Titolarità o panchina prevista: ${coverage.starting}/${coverage.total} · Avversario e orario verificati: ${coverage.matchup}/${coverage.total}.<br>Segnalazioni esplicite su infortuni o squalifiche: ${coverage.availability}/${coverage.total}. Nessuna segnalazione non significa disponibilità confermata. Dati letti dalle tabelle; nessun valore stimato.</p>${data.warnings.map(w => `<p class="field-hint">${escape(w)}</p>`).join('')}<details class="research-details"><summary>Esamina dati e fonti</summary>${data.players.map(player => `<section class="research-player"><h3>${escape(player.name)}</h3>${player.observations.map(o => `<div class="research-observation"><strong>${escape(FIELDS[o.field])}</strong><p>${escape(o.value)} ${o.kind === 'forecast' ? '<span class="forecast-label">Previsione</span>' : ''}</p><small>${escape([o.period,o.unit,o.updatedAt].filter(Boolean).join(' · '))} [${escape(o.sourceId)}]</small><details><summary>Citazione</summary><blockquote>${escape(o.quote)}</blockquote></details></div>`).join('')}<p class="field-hint">Da verificare: ${player.missing.filter(field => !['minutes','xg','xa','shots'].includes(field)).map(field => escape(FIELDS[field])).join(', ') || 'nessun campo mancante'}.</p></section>`).join('')}<h3>Fonti recuperate</h3><ul>${data.sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">[${escape(source.id)}] ${escape(source.title)}</a></li>`).join('')}</ul></details></div>`;
}
function refresh() {
  const host = document.querySelector('#ai-analysis');
  if (!host || !visibleTeam) return;
  const team = visibleTeam;
  let entry = analyses.get(team.id);
  if (!entry) entry=hydrate(team);
  const busy = pending?.teamId === team.id;
  const reason = staleReason(entry.research,team,entry.matchday);
  host.innerHTML = `<section class="content-card compact ai-card"><p class="eyebrow">PREPARA LA GIORNATA</p><h2>Dai dati alla formazione</h2><p class="ai-description">Aggiorna le informazioni sui tuoi giocatori, poi chiedi una proposta con le regole della tua lega.</p>
    <label for="ai-matchday">Giornata da preparare</label><input id="ai-matchday" maxlength="120" placeholder="Prossima giornata non ancora iniziata" value="${escape(entry.matchday)}" ${pending ? 'disabled' : ''}>
    <div class="research-step"><h3><span>01</span> Aggiorna i dati</h3><p class="field-hint">Voti, fantamedia e probabili formazioni da Fantacalcio; xG e xA da Understat. Dati recuperati direttamente dalle fonti, senza chiamate AI. L’ultima ricerca è salvata nel database e disponibile su tutti i tuoi dispositivi. Ogni aggiornamento sostituisce il precedente.</p><button id="ai-research" class="button button-primary" ${pending || !understatURL || !team.players.length ? 'disabled' : ''}>${busy && pending.kind === 'research' ? 'Aggiornamento in corso…' : 'Aggiorna dati'}</button></div>
    ${understatView(entry.research?.understat)}${dataView(entry.research)}<p id="research-warning" class="field-hint">${escape(reason)}</p>
    <div class="research-step"><h3><span>02</span> Scegli la formazione</h3><p class="field-hint">Il modello scelto usa lo stesso prompt e i dati salvati, senza nuove ricerche. <a href="#regole/${encodeURIComponent(team.id)}">Modifica regole</a></p><label for="ai-model">Modello AI</label><select id="ai-model" ${pending?'disabled':''}>${AI_MODELS.map(model=>`<option value="${model.id}" ${model.id===entry.model?'selected':''}>${model.label}</option>`).join('')}</select><p class="field-hint">La nuova proposta sostituisce la precedente. Il costo stimato apparirà dopo la risposta, in USD. Kimi ha tariffe più alte. La stima usa i token riportati e le tariffe standard del 08/10/2026, senza imposte o accordi personalizzati. <a href="${modelInfo(entry.model).url}" target="_blank" rel="noopener noreferrer">Tariffe Fireworks</a></p><button id="ai-analyze" class="button button-outline" ${pending || !fireworksReady() || reason ? 'disabled' : ''}>${busy && pending.kind === 'analysis' ? 'Analisi in corso…' : 'Suggerisci formazione'}</button></div>
    <div class="ai-actions">${busy && pending.phase !== 'saving' ? '<button id="ai-cancel" class="button button-outline">Annulla</button>' : ''}</div>
    <p id="ai-progress" role="status">${escape(busy ? entry.progress || 'Richiesta in corso…' : pending ? 'È in corso una richiesta per un’altra squadra.' : !fireworksReady() ? (HOSTED_API ? 'Servizio AI non disponibile. Puoi comunque aggiornare i dati.' : 'Servizi AI non configurati.') : !understatURL ? 'Servizio Understat non configurato.' : entry.notice || '')}</p>
    ${entry.error ? `<p class="import-error" role="alert">${escape(entry.error)}</p>` : ''}
    ${entry.recommendation ? `<section class="ai-result"><h3>Proposta di formazione</h3><p class="field-hint">Modello: ${modelInfo(entry.recommendation.model??DEFAULT_MODEL).label}<br>${escape(usageLabel(entry.recommendation.aiUsage))}<br>Ultima proposta: ${escape(dateLabel(entry.recommendation.createdAt))} · salvata nel database<br>Dati della ricerca: ${escape(dateLabel(entry.recommendation.researchAt))} · ${escape(entry.recommendation.matchday || 'Prossima giornata')} · Da verificare prima della consegna.</p><p id="recommendation-stale" class="import-error" ${recommendationIsStale(entry.recommendation,team,entry.research,entry.matchday)||reason?'':'hidden'}>Questa proposta è superata. Generane una nuova con dati aggiornati.</p><div class="ai-result-text">${escape(entry.recommendation.text)}</div><details><summary>Fonti di questa proposta</summary><ul>${entry.recommendation.sources.map(source=>`<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">[${escape(source.id)}] ${escape(source.title)}</a></li>`).join('')}</ul></details><p class="field-hint">Ogni nuova proposta sostituisce la precedente. La rosa non è stata modificata.</p>${renderFollowUp(team,{matchday:entry.matchday,draft:entry.followUpDraft??'',pending:Boolean(pending),asking:busy&&pending.kind==='followUp',saving:pending?.phase==='saving',ready:fireworksReady(),error:entry.followUpError??''})}</section>` : ''}</section>`;
  host.querySelector('#ai-matchday').oninput = event => {
    entry.matchday = event.target.value;
    const reason = staleReason(entry.research,team,entry.matchday);
    host.querySelector('#research-warning').textContent = reason;
    host.querySelector('#ai-analyze').disabled = Boolean(pending || !fireworksReady() || reason);
    const warning=host.querySelector('#recommendation-stale');
    if(warning)warning.hidden=!(recommendationIsStale(entry.recommendation,team,entry.research,entry.matchday)||reason);
    const followUpReason=followUpUnavailableReason(team,entry.matchday),question=host.querySelector('#follow-up-question');
    if(question){
      const warning=host.querySelector('#follow-up-warning');warning.textContent=followUpReason;warning.hidden=!followUpReason;
      question.disabled=Boolean(pending||!fireworksReady()||followUpReason);
      host.querySelector('#follow-up-send').disabled=question.disabled||!question.value.trim();
    }
    onContextChange?.(team,entry.matchday);
  };
  host.querySelector('#ai-cancel')?.addEventListener('click', () => pending?.controller.abort());
  host.querySelector('#follow-up-cancel')?.addEventListener('click', () => pending?.controller.abort());
  host.querySelector('#ai-research').onclick = () => run('research',team,entry);
  host.querySelector('#ai-model').onchange=event=>{entry.model=event.target.value;refresh();};
  host.querySelector('#ai-analyze').onclick = () => run('analysis',team,entry);
  const question=host.querySelector('#follow-up-question');
  if(question){
    question.oninput=event=>{entry.followUpDraft=event.target.value;host.querySelector('#follow-up-send').disabled=question.disabled||!entry.followUpDraft.trim();};
    host.querySelector('#follow-up-form').onsubmit=event=>{event.preventDefault();if(!question.disabled&&question.value.trim())run('followUp',team,entry);};
  }
  onContextChange?.(team,entry.matchday);
}
async function run(kind,team,entry) {
  if (pending) return;
  const snapshot = structuredClone(team), researchSnapshot = structuredClone(entry.research), controller = new AbortController(), matchday = entry.matchday, question=(entry.followUpDraft??'').trim(), model=entry.model??DEFAULT_MODEL, label=modelInfo(kind==='followUp'?(snapshot.recommendation?.model??DEFAULT_MODEL):model).label;
  pending = { kind,teamId:team.id,controller }; entry.error = ''; entry.followUpError=''; entry.notice = ''; entry.progress = kind === 'analysis' ? `${label} sta preparando la proposta. La richiesta può durare fino a 5 minuti.` : kind==='followUp'?`${label} sta leggendo la proposta e la tua domanda. La risposta può richiedere fino a 5 minuti.`:'';
  refresh();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, kind === 'research' ? 600000 : 300000);
  async function persist(resultKind,result){
    if(!saveResult)throw new Error('Salvataggio database non disponibile.');
    clearTimeout(timer);pending.phase='saving';entry.progress='Salvataggio nel database…';refresh();
    const saved=await saveResult(team.id,resultKind,result,fingerprint(snapshot));
    hydrate(saved);if(visibleTeam?.id===saved.id)visibleTeam=saved;
  }
  try {
    if (kind === 'research') {
      const research = await researchSquad({ tavilyKey,fireworksKey:key,understatURL,team:snapshot,matchday,signal:controller.signal,onProgress:progress => {
        entry.progress = progress;
        if (visibleTeam?.id === team.id) { const status = document.querySelector('#ai-progress'); if (status) status.textContent = progress; }
      } });
      controller.signal.throwIfAborted();
      // Only replace the previous snapshot after the complete pipeline succeeds.
      research.id=crypto.randomUUID();research.completedAt=new Date().toISOString();
      await persist('research',research);
      entry.notice = 'Ricerca salvata nel database e disponibile su tutti i dispositivi.';
    } else if(kind==='followUp') {
      const result=await askFollowUp({key,team:snapshot,question,matchday,signal:controller.signal,includeUsage:true});
      controller.signal.throwIfAborted();
      await persist('followUp',{id:crypto.randomUUID(),createdAt:new Date().toISOString(),question,answer:result.answer,model:result.model,aiUsage:result.aiUsage,recommendationId:snapshot.recommendation.id,previousFollowUpId:snapshot.recommendation.followUps?.at(-1)?.id??null,matchday});
      entry.followUpDraft='';entry.notice='Risposta salvata con la proposta. La formazione non è stata modificata.';
    } else {
      const result = await analyzeSquad({key,team:snapshot,research:researchSnapshot,matchday,model,signal:controller.signal});
      controller.signal.throwIfAborted();
      await persist('recommendation',{version:2,id:crypto.randomUUID(),text:result.text,model:result.model,aiUsage:result.aiUsage,lineup:result.lineup,forecast:result.forecast,sources:result.sources,createdAt:new Date().toISOString(),teamFingerprint:fingerprint(snapshot),researchId:researchSnapshot.id,researchAt:researchSnapshot.completedAt,matchday});
      entry.notice='Proposta salvata nel database e applicata al campo qui sotto.';
    }
  } catch (error) {
    const message = controller.signal.aborted ? (timedOut ? 'Tempo massimo raggiunto.' : 'Richiesta annullata.') + ` I dati precedenti sono conservati. ${kind !== 'research' ? 'La richiesta AI già inviata può consumare credito.' : 'Nessun credito consumato.'}` : error.message;
    if(kind==='followUp')entry.followUpError=message;else entry.error=message;
  } finally { clearTimeout(timer); pending = null; refresh(); }
}
