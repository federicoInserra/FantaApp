import {ENGINE_ID,analyzeStatistical} from './statistical-engine.mjs';
import {recommendationView} from './analysis-presentation.mjs';
import {AI_MODELS,DEFAULT_MODEL,modelInfo} from './ai-models.mjs';
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
  if(!entry){entry={matchday:team.research?.matchday??'',model:team.recommendation?.method===ENGINE_ID?ENGINE_ID:team.recommendation?.model??DEFAULT_MODEL};analyses.set(team.id,entry);}
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
  return `<div class="research-summary understat-summary"><div class="source-card-head"><span class="source-mark" aria-hidden="true">U</span><div><strong>Understat</strong><span>xG, xA e rendimento storico</span></div><span class="source-coverage">${covered}<small>/${data.players.length}</small></span></div><p class="analysis-meta">Raccolta ${escape(dateLabel(data.retrievedAt))}</p><details class="research-details"><summary>Esamina statistiche Understat</summary><p class="field-hint">Stagione ${data.season}/${data.season+1}. Ultima partita: ${data.latestMatchAt?escape(dateLabel(data.latestMatchAt)):'nessuna'}. Statistiche storiche, non probabilità di bonus.</p>${data.players.map(p=>`<section class="research-player"><h3>${escape(p.name)}</h3>${p.reason?`<p class="import-error">${escape(p.reason)}</p>`:''}${p.player?`<p>${escape(p.player.name)} · ${escape(p.player.clubs.join(', '))}</p><p>${n(p.player.minutes)} minuti · ${n(p.player.games)} presenze</p><p>Totali: xG ${n(p.player.xg)} · npxG ${n(p.player.npxg)} · xA ${n(p.player.xa)} · Tiri ${n(p.player.shots)}</p><p>Per 90: npxG ${n(p.player.npxgPer90)} · xA ${n(p.player.xaPer90)}</p>`:''}</section>`).join('')}<h3>Squadre e avversarie</h3>${data.teams.map(t=>`<section class="research-player"><strong>${escape(t.name)}</strong>${[['Totale',t.overall],['Casa',t.home],['Trasferta',t.away]].map(([label,s])=>`<p>${label}: ${s.games} partite · xG ${n(s.xgPerMatch)} / xGA ${n(s.xgaPerMatch)} per partita</p>`).join('')}</section>`).join('')}<p class="field-hint">${data.fixtures.length} partite future nei prossimi 14 giorni. La giornata viene verificata con il calendario.</p><a href="https://understat.com/league/Serie_A/${data.season}" target="_blank" rel="noopener noreferrer">[U1] Apri Understat</a></details></div>`;
}
function dataView(data) {
  if (!data) return '';
  const coverage = coverageOf(data.players);
  return `<div class="research-summary"><div class="source-card-head"><span class="source-mark" aria-hidden="true">F</span><div><strong>Fantacalcio</strong><span>Voti e probabili formazioni</span></div><span class="source-coverage">${coverage.statistics}<small>/${coverage.total}</small></span></div><p class="analysis-meta">Raccolta ${escape(dateLabel(data.completedAt))}</p><div class="coverage-strip"><span>Medie <strong>${coverage.averages}/${coverage.total}</strong></span><span>Impiego <strong>${coverage.starting}/${coverage.total}</strong></span><span>Avversari <strong>${coverage.matchup}/${coverage.total}</strong></span></div>${data.warnings.length?`<details class="source-notes"><summary>${data.warnings.length} note sulla raccolta</summary>${data.warnings.map(w=>`<p class="field-hint">${escape(w)}</p>`).join('')}</details>`:''}<details class="research-details"><summary>Esamina dati e fonti</summary><p class="field-hint">Segnalazioni esplicite di infortuni o squalifiche: ${coverage.availability}/${coverage.total}. Nessuna segnalazione non conferma la disponibilità. Dati letti dalle tabelle, senza valori stimati.</p>${data.players.map(player => `<section class="research-player"><h3>${escape(player.name)}</h3>${player.observations.map(o => `<div class="research-observation"><strong>${escape(FIELDS[o.field])}</strong><p>${escape(o.value)} ${o.kind === 'forecast' ? '<span class="forecast-label">Previsione</span>' : ''}</p><small>${escape([o.period,o.unit,o.updatedAt].filter(Boolean).join(' · '))} [${escape(o.sourceId)}]</small><details><summary>Citazione</summary><blockquote>${escape(o.quote)}</blockquote></details></div>`).join('')}<p class="field-hint">Da verificare: ${player.missing.filter(field => !['minutes','xg','xa','shots'].includes(field)).map(field => escape(FIELDS[field])).join(', ') || 'nessun campo mancante'}.</p></section>`).join('')}<h3>Fonti recuperate</h3><ul>${data.sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">[${escape(source.id)}] ${escape(source.title)}</a></li>`).join('')}</ul></details></div>`;
}
function refresh() {
  const host = document.querySelector('#ai-analysis');
  if (!host || !visibleTeam) return;
  const team = visibleTeam;
  let entry = analyses.get(team.id);
  if (!entry) entry=hydrate(team);
  const busy = pending?.teamId === team.id;
  const reason = staleReason(entry.research,team,entry.matchday);
  const engine=entry.model===ENGINE_ID;
  host.innerHTML = `<section class="ai-card analysis-workspace" aria-labelledby="analysis-title">
    <header class="analysis-intro"><div><p class="eyebrow">PREPARA LA GIORNATA</p><h2 id="analysis-title">Dai dati alla formazione</h2><p>Due passaggi per preparare il tuo undici.</p></div><div class="analysis-matchday"><span class="eyebrow">GIORNATA AUTOMATICA</span><strong>${entry.matchday?`Giornata ${escape(entry.matchday.replace(/^giornata\s*/i,''))}`:'Da rilevare'}</strong><span>${entry.research?.sources?.some(s=>s.id==='L1')?'Calendario ufficiale Serie A':'Rilevata con Aggiorna dati'}</span></div></header>
    <div class="analysis-steps">
      <section class="research-step analysis-surface" aria-labelledby="research-title"><header class="analysis-section-head"><div class="step-title"><span class="step-number" aria-hidden="true">01</span><div><p class="eyebrow">LE FONTI</p><h3 id="research-title">Aggiorna i dati</h3></div></div><span class="analysis-chip chip-free">Nessun costo AI</span></header><p class="analysis-description">Statistiche e probabili formazioni, direttamente dalle fonti.</p>
        ${entry.research?`<div class="research-source-grid">${understatView(entry.research.understat)}${dataView(entry.research)}</div>`:'<div class="research-empty"><span aria-hidden="true">↻</span><p>La tua raccolta parte da qui.</p><small>Fantacalcio per voti e impiego, Understat per xG e xA.</small></div>'}
        <p id="research-warning" class="analysis-alert" ${reason?'':'hidden'}>${escape(reason)}</p><footer class="analysis-card-footer"><span class="analysis-meta">${entry.research?'Raccolta salvata · condivisa tra i dispositivi':'Ogni aggiornamento sostituisce il precedente'}</span><button id="ai-research" class="button button-outline" ${pending||!understatURL||!team.players.length?'disabled':''}>${busy&&pending.kind==='research'?'Aggiornamento in corso…':'Aggiorna dati'} <span aria-hidden="true">↻</span></button></footer></section>
      <section class="research-step analysis-surface analysis-model-card" aria-labelledby="model-title"><header class="analysis-section-head"><div class="step-title"><span class="step-number" aria-hidden="true">02</span><div><p class="eyebrow">LA SCELTA</p><h3 id="model-title">Scegli la formazione</h3></div></div></header><p class="analysis-description">Scegli il metodo per valutare la rosa con le regole della tua lega.</p><div class="model-picker"><label for="ai-model">Metodo</label><select id="ai-model" ${pending?'disabled':''}>${[...AI_MODELS,{id:ENGINE_ID,label:'Statistical engine'}].map(model=>`<option value="${model.id}" ${model.id===entry.model?'selected':''}>${model.label}</option>`).join('')}</select><p class="analysis-meta">Usa la raccolta salvata, senza nuove ricerche.</p></div><a class="analysis-text-link" href="#regole/${encodeURIComponent(team.id)}">Regole della lega <span aria-hidden="true">↗</span></a><details class="analysis-disclosure pricing-disclosure"><summary>Costi e dettagli <span aria-hidden="true">+</span></summary><div class="analysis-disclosure-body"><p>${engine?'Statistical engine esegue simulazioni locali, senza chiave né costo AI. Supporta il profilo Classic predefinito (0–5 sostituzioni); mostra ipotesi e dati mancanti.':'Kimi ha tariffe più alte.'} ${engine?'Calcolo limitato a 1.000 scenari e 136 candidati, con possibilità di annullare. Gli orari devono essere verificati e futuri per tutti i giocatori disponibili.':'Il costo in USD appare dopo la risposta e usa i token riportati e le tariffe standard del 08/10/2026, senza imposte o accordi personalizzati.'}</p><p>Ogni nuova proposta sostituisce la precedente.</p><a class="analysis-text-link" href="${engine?'https://understat.com':modelInfo(entry.model).url}" target="_blank" rel="noopener noreferrer">${engine?'Fonte statistica ↗':'Tariffe Fireworks ↗'}</a></div></details><button id="ai-analyze" class="button button-primary" ${pending||(!engine&&!fireworksReady())||reason?'disabled':''}>${busy&&pending.kind==='analysis'?'Analisi in corso…':'Suggerisci formazione'} <span aria-hidden="true">→</span></button></section>
    </div>
    <div class="analysis-feedback ${busy?'is-pending':''}"><p id="ai-progress" role="status">${escape(busy?entry.progress||'Richiesta in corso…':pending?'È in corso una richiesta per un’altra squadra.':!engine&&!fireworksReady()?(HOSTED_API?'Servizio AI non disponibile. Puoi comunque aggiornare i dati.':'Servizi AI non configurati.'):!understatURL?'Servizio Understat non configurato.':entry.notice||'')}</p>${busy&&pending.phase!=='saving'?'<button id="ai-cancel" class="button button-outline">Annulla</button>':''}</div>
    ${entry.error?`<p class="import-error analysis-alert" role="alert">${escape(entry.error)}</p>`:''}
    ${entry.recommendation?recommendationView(entry.recommendation,recommendationIsStale(entry.recommendation,team,entry.research,entry.matchday)||Boolean(reason))+renderFollowUp(team,{matchday:entry.matchday,draft:entry.followUpDraft??'',pending:Boolean(pending),asking:busy&&pending.kind==='followUp',saving:pending?.phase==='saving',ready:fireworksReady(),error:entry.followUpError??''}):''}</section>`;
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
  host.querySelectorAll('[data-follow-up-question]').forEach(button=>{button.onclick=()=>{if(!question||question.disabled)return;question.value=button.dataset.followUpQuestion;question.dispatchEvent(new Event('input',{bubbles:true}));question.focus();};});
  onContextChange?.(team,entry.matchday);
}
async function run(kind,team,entry) {
  if (pending) return;
  const snapshot = structuredClone(team), researchSnapshot = structuredClone(entry.research), controller = new AbortController(), matchday = entry.matchday, question=(entry.followUpDraft??'').trim(), model=entry.model??DEFAULT_MODEL, label=model===ENGINE_ID&&kind!=='followUp'?'Statistical engine':modelInfo(kind==='followUp'?(snapshot.recommendation?.model??DEFAULT_MODEL):model).label;
  pending = { kind,teamId:team.id,controller }; entry.error = ''; entry.followUpError=''; entry.notice = ''; entry.progress = kind === 'analysis' ? model===ENGINE_ID?'Statistical engine sta confrontando scenari e formazioni…':`${label} sta preparando la proposta. La richiesta può durare fino a 5 minuti.` : kind==='followUp'?`${label} sta leggendo la proposta e la tua domanda. La risposta può richiedere fino a 5 minuti.`:'';
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
      const result = model===ENGINE_ID?await analyzeStatistical({team:snapshot,research:researchSnapshot,matchday,signal:controller.signal,onProgress:progress=>{entry.progress=progress;const status=document.querySelector('#ai-progress');if(status)status.textContent=progress;}}):await analyzeSquad({key,team:snapshot,research:researchSnapshot,matchday,model,signal:controller.signal});
      controller.signal.throwIfAborted();
      await persist('recommendation',{version:2,id:crypto.randomUUID(),text:result.text,...(result.method===ENGINE_ID?{method:result.method,engine:result.engine}:{model:result.model,aiUsage:result.aiUsage}),lineup:result.lineup,forecast:result.forecast,sources:result.sources,createdAt:new Date().toISOString(),teamFingerprint:fingerprint(snapshot),researchId:researchSnapshot.id,researchAt:researchSnapshot.completedAt,matchday});
      entry.notice='Proposta salvata nel database e applicata al campo qui sotto.';
    }
  } catch (error) {
    const message = controller.signal.aborted ? (timedOut ? 'Tempo massimo raggiunto.' : 'Richiesta annullata.') + ` I dati precedenti sono conservati. ${(kind==='followUp'||(kind==='analysis'&&model!==ENGINE_ID)) ? 'La richiesta AI già inviata può consumare credito.' : 'Nessun credito consumato.'}` : error.message;
    if(kind==='followUp')entry.followUpError=message;else entry.error=message;
  } finally { clearTimeout(timer); pending = null; refresh(); }
}
