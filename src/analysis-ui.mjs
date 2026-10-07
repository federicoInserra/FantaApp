import { HOSTED_API } from './deployment.mjs';
import { UNDERSTAT_URL_STORAGE, understatServiceURL, fetchUnderstat } from './understat.mjs';
import { teamRules } from './rules.mjs';
import { API_KEY_STORAGE, analyzeSquad } from './analysis.mjs';
import { TAVILY_KEY_STORAGE, researchSquad, researchBudget, loadResearch, saveResearch, staleReason, FIELDS } from './research.mjs';
const analyses = new Map();
let pending = null, visibleTeam, key = '', tavilyKey = '', understatURL = '';
try { key = localStorage.getItem(API_KEY_STORAGE) ?? ''; tavilyKey = localStorage.getItem(TAVILY_KEY_STORAGE) ?? ''; understatURL = localStorage.getItem(UNDERSTAT_URL_STORAGE) ?? ''; } catch { /* Settings remain accessible. */ }
if (HOSTED_API) understatURL = location.origin;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fingerprint = team => JSON.stringify([team.name, team.listSource, teamRules(team), team.players.map(p => [p.id,p.name,p.club,p.role,p.available])]);
const dateLabel = date => new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
export function setupAnalysis() {
  const dialog = document.querySelector('#ai-settings');
  const input = document.querySelector('#ai-key'), tavilyInput = document.querySelector('#tavily-key'), status = document.querySelector('#ai-key-status');
  const understatInput=document.querySelector('#understat-url'), understatStatus=document.querySelector('#understat-status'), check=document.querySelector('#understat-check');
  document.querySelector('#understat-service-config').hidden=HOSTED_API;
  check.onclick=async()=>{
    check.disabled=true;understatStatus.textContent='Collegamento in corso…';
    try { const data=await fetchUnderstat({serviceURL:understatInput.value,signal:AbortSignal.timeout(20000)});understatStatus.textContent=`Collegato: ${data.players.length} giocatori, ${data.teams.length} squadre · ${data.season}/${data.season+1}. Ultima partita registrata: ${data.latestMatchAt ? dateLabel(data.latestMatchAt) : 'nessuna'}.`; }
    catch(error){understatStatus.textContent=error.message;}finally{check.disabled=false;}
  };
  const showStatus = () => { status.textContent = `Fireworks: ${key ? 'chiave salvata' : 'da configurare'} · Tavily: ${tavilyKey ? 'chiave salvata' : 'da configurare'} · Understat: ${understatURL ? 'URL salvato' : 'da configurare'}`; };
  document.querySelector('#ai-settings-open').onclick = () => { input.value = ''; tavilyInput.value = ''; understatInput.value=understatURL; understatStatus.textContent=''; showStatus(); dialog.showModal(); };
  document.querySelector('#ai-key-form').onsubmit = event => {
    event.preventDefault();
    const nextKey = input.value.trim() || key, nextTavily = tavilyInput.value.trim() || tavilyKey;
    if ([nextKey,nextTavily].some(value => /\s/.test(value))) { status.textContent = 'Le chiavi non possono contenere spazi.'; return; }
    try {
      const service=HOSTED_API ? location.origin : understatInput.value.trim() ? understatServiceURL(understatInput.value) : '';
      localStorage.setItem(UNDERSTAT_URL_STORAGE,service);understatURL=service;
      if (input.value.trim()) { localStorage.setItem(API_KEY_STORAGE, nextKey); key = nextKey; }
      if (tavilyInput.value.trim()) { localStorage.setItem(TAVILY_KEY_STORAGE, nextTavily); tavilyKey = nextTavily; }
      input.value = ''; tavilyInput.value = ''; showStatus(); refresh();
    } catch(error) { status.textContent = error.message || 'Salvataggio non riuscito.'; }
  };
  for (const [id, storageKey] of [['ai-key-forget',API_KEY_STORAGE],['tavily-key-forget',TAVILY_KEY_STORAGE]]) {
    document.querySelector('#'+id).onclick = () => {
      try { localStorage.removeItem(storageKey); if (storageKey === API_KEY_STORAGE) key = ''; else tavilyKey = ''; pending?.controller.abort(); showStatus(); refresh(); }
      catch { status.textContent = 'Impossibile rimuovere la chiave.'; }
    };
  }
  dialog.addEventListener('close', () => { input.value = ''; tavilyInput.value = ''; });
}
export function mountAnalysis(team) { visibleTeam = team; refresh(); }
function understatView(data) {
  if (!data) return '';
  const n=value=>value==null ? '—' : Number(value).toLocaleString('it-IT',{maximumFractionDigits:3});
  const covered=data.players.filter(p=>p.player&&!p.reason).length;
  return `<div class="research-summary understat-summary"><strong>Understat · ${covered}/${data.players.length} giocatori con dati completi</strong><p class="field-hint">Stagione ${data.season}/${data.season+1} · Raccolta ${escape(dateLabel(data.retrievedAt))}<br>Ultima partita nei dati: ${data.latestMatchAt ? escape(dateLabel(data.latestMatchAt)) : 'nessuna'}. Statistiche storiche, non probabilità di bonus.</p><details class="research-details"><summary>Esamina statistiche Understat</summary>${data.players.map(p=>`<section class="research-player"><h3>${escape(p.name)}</h3>${p.reason?`<p class="import-error">${escape(p.reason)}</p>`:''}${p.player?`<p>${escape(p.player.name)} · ${escape(p.player.clubs.join(', '))}</p><p>${n(p.player.minutes)} minuti · ${n(p.player.games)} presenze</p><p>Totali: xG ${n(p.player.xg)} · npxG ${n(p.player.npxg)} · xA ${n(p.player.xa)} · Tiri ${n(p.player.shots)}</p><p>Per 90: npxG ${n(p.player.npxgPer90)} · xA ${n(p.player.xaPer90)}</p>`:''}</section>`).join('')}<h3>Squadre e avversarie</h3>${data.teams.map(t=>`<section class="research-player"><strong>${escape(t.name)}</strong>${[['Totale',t.overall],['Casa',t.home],['Trasferta',t.away]].map(([label,s])=>`<p>${label}: ${s.games} partite · xG ${n(s.xgPerMatch)} / xGA ${n(s.xgaPerMatch)} per partita</p>`).join('')}</section>`).join('')}<p class="field-hint">${data.fixtures.length} partite future nei prossimi 14 giorni. La giornata viene verificata con il calendario.</p><a href="https://understat.com/league/Serie_A/${data.season}" target="_blank" rel="noopener noreferrer">[U1] Apri Understat</a></details></div>`;
}
function dataView(data) {
  if (!data) return '';
  const covered = data.players.filter(p => p.observations.length).length;
  return `<div class="research-summary"><p><strong>${covered}/${data.players.length} giocatori con notizie o voti raccolti</strong><br><span>Raccolta: ${escape(dateLabel(data.createdAt))} · ${escape(data.credits)} crediti Tavily</span></p><p class="field-hint">Le citazioni sono controllate nel testo recuperato; l’interpretazione AI resta da verificare. I campi mancanti non sono stimati.</p>${data.warnings.map(w => `<p class="field-hint">${escape(w)}</p>`).join('')}<details class="research-details"><summary>Esamina dati e fonti</summary>${data.players.map(player => `<section class="research-player"><h3>${escape(player.name)}</h3>${player.observations.map(o => `<div class="research-observation"><strong>${escape(FIELDS[o.field])}</strong><p>${escape(o.value)} ${o.kind === 'forecast' ? '<span class="forecast-label">Previsione</span>' : ''}</p><small>${escape([o.period,o.unit,o.updatedAt].filter(Boolean).join(' · '))} [${escape(o.sourceId)}]</small><details><summary>Citazione</summary><blockquote>${escape(o.quote)}</blockquote></details></div>`).join('')}<p class="field-hint">Da verificare: ${player.missing.filter(field => !['minutes','xg','xa','shots'].includes(field)).map(field => escape(FIELDS[field])).join(', ') || 'nessun campo mancante'}.</p></section>`).join('')}<h3>Fonti recuperate</h3><ul>${data.sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">[${escape(source.id)}] ${escape(source.title)}</a></li>`).join('')}</ul></details></div>`;
}
function refresh() {
  const host = document.querySelector('#ai-analysis');
  if (!host || !visibleTeam) return;
  const team = visibleTeam;
  let entry = analyses.get(team.id);
  if (!entry) { const research = loadResearch(team.id); entry = { matchday: research?.matchday ?? '', research }; analyses.set(team.id,entry); }
  const busy = pending?.teamId === team.id;
  const reason = staleReason(entry.research,team,entry.matchday);
  host.innerHTML = `<section class="content-card compact ai-card"><p class="eyebrow">PREPARA LA GIORNATA</p><h2>Dai dati alla formazione</h2><p class="ai-description">Aggiorna le informazioni sui tuoi giocatori, poi chiedi una proposta con le regole della tua lega.</p>
    <label for="ai-matchday">Giornata da preparare</label><input id="ai-matchday" maxlength="120" placeholder="Prossima giornata non ancora iniziata" value="${escape(entry.matchday)}" ${pending ? 'disabled' : ''}>
    <div class="research-step"><h3><span>01</span> Aggiorna i dati</h3><p class="field-hint">Understat fornisce le statistiche. Tavily cerca voti e notizie; GLM li organizza. Budget indicativo: ${researchBudget(team)} crediti Tavily per aggiornamento, più il consumo Fireworks. I dati restano disponibili su questo dispositivo.</p><button id="ai-research" class="button button-primary" ${pending || !key || !tavilyKey || !understatURL || !team.players.length ? 'disabled' : ''}>${busy && pending.kind === 'research' ? 'Aggiornamento in corso…' : 'Aggiorna dati'}</button></div>
    ${understatView(entry.research?.understat)}${dataView(entry.research)}<p id="research-warning" class="field-hint">${escape(reason)}</p>
    <div class="research-step"><h3><span>02</span> Scegli la formazione</h3><p class="field-hint">DeepSeek usa i dati salvati, senza nuove ricerche. <a href="#regole/${encodeURIComponent(team.id)}">Modifica regole</a></p><button id="ai-analyze" class="button button-outline" ${pending || !key || reason ? 'disabled' : ''}>${busy && pending.kind === 'analysis' ? 'Analisi in corso…' : 'Suggerisci formazione'}</button></div>
    <div class="ai-actions">${busy ? '<button id="ai-cancel" class="button button-outline">Annulla</button>' : ''}<button id="ai-configure" class="button button-quiet">Impostazioni AI</button></div>
    <p id="ai-progress" role="status">${escape(busy ? entry.progress || 'Richiesta in corso…' : pending ? 'È in corso una richiesta per un’altra squadra.' : !key || !tavilyKey ? 'Aggiungi le chiavi Fireworks e Tavily per aggiornare i dati.' : !understatURL ? 'Collega il servizio Understat nelle impostazioni AI.' : entry.notice || '')}</p>
    ${entry.error ? `<p class="import-error" role="alert">${escape(entry.error)}</p>` : ''}
    ${entry.result ? `<section class="ai-result"><h3>Proposta di formazione</h3><p class="field-hint">${escape(entry.date)} · ${escape(entry.analyzedMatchday || 'Prossima giornata')} · Da verificare prima della consegna.</p>${entry.fingerprint !== fingerprint(team) || entry.researchAt !== entry.research?.createdAt || entry.analyzedMatchday !== entry.matchday || reason ? '<p class="import-error">Questa proposta è superata. Generane una nuova con dati aggiornati.</p>' : ''}<div class="ai-result-text">${escape(entry.result.text)}</div><p class="field-hint">I riferimenti [S…] corrispondono alle fonti nei dati raccolti. La rosa non è stata modificata.</p></section>` : ''}</section>`;
  host.querySelector('#ai-configure').onclick = () => document.querySelector('#ai-settings-open').click();
  host.querySelector('#ai-matchday').oninput = event => {
    entry.matchday = event.target.value;
    const reason = staleReason(entry.research,team,entry.matchday);
    host.querySelector('#research-warning').textContent = reason;
    host.querySelector('#ai-analyze').disabled = Boolean(pending || !key || reason);
    // Hide an old recommendation while its matchday is being changed.
    const result = host.querySelector('.ai-result'); if (result) result.hidden = entry.matchday !== entry.analyzedMatchday;
  };
  host.querySelector('#ai-cancel')?.addEventListener('click', () => pending?.controller.abort());
  host.querySelector('#ai-research').onclick = () => run('research',team,entry);
  host.querySelector('#ai-analyze').onclick = () => run('analysis',team,entry);
}
async function run(kind,team,entry) {
  if (pending) return;
  const snapshot = structuredClone(team), controller = new AbortController(), matchday = entry.matchday;
  pending = { kind,teamId:team.id,controller }; entry.error = ''; entry.notice = ''; entry.progress = '';
  refresh();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, kind === 'research' ? 600000 : 180000);
  try {
    if (kind === 'research') {
      const research = await researchSquad({ tavilyKey,fireworksKey:key,understatURL,team:snapshot,matchday,signal:controller.signal,onProgress:progress => {
        entry.progress = progress;
        if (visibleTeam?.id === team.id) { const status = document.querySelector('#ai-progress'); if (status) status.textContent = progress; }
      } });
      controller.signal.throwIfAborted();
      // Only replace the previous snapshot after the complete pipeline succeeds.
      saveResearch(team.id,research); entry.research = research; entry.result = null; entry.notice = 'Dati salvati. Esamina le informazioni mancanti prima di continuare.';
    } else {
      const result = await analyzeSquad({key,team:snapshot,research:entry.research,matchday,signal:controller.signal});
      controller.signal.throwIfAborted();
      Object.assign(entry,{ result,fingerprint:fingerprint(snapshot),researchAt:entry.research.createdAt,date:dateLabel(new Date()),analyzedMatchday:matchday });
    }
  } catch (error) {
    entry.error = controller.signal.aborted ? (timedOut ? 'Tempo massimo raggiunto.' : 'Richiesta annullata.') + ' I dati precedenti sono conservati. Le richieste già inviate possono consumare credito.' : error.name === 'QuotaExceededError' ? 'Spazio locale insufficiente. I dati precedenti sono conservati.' : error.message;
  } finally { clearTimeout(timer); pending = null; refresh(); }
}
