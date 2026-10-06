import { teamRules } from './rules.mjs';
import { API_KEY_STORAGE, analyzeSquad } from './analysis.mjs';

const analyses = new Map();
let pending = null;
let visibleTeam;
let key = '';
try { key = localStorage.getItem(API_KEY_STORAGE) ?? ''; } catch { /* Settings can still be opened. */ }
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fingerprint = team => JSON.stringify([team.name, team.listSource, teamRules(team), team.players.map(p => [p.id, p.name, p.club, p.role, p.available])]);

export function setupAnalysis() {
  const dialog = document.querySelector('#ai-settings');
  const input = document.querySelector('#ai-key');
  const status = document.querySelector('#ai-key-status');
  const showStatus = () => { status.textContent = key ? 'Chiave salvata su questo browser.' : 'Nessuna chiave salvata.'; };
  document.querySelector('#ai-settings-open').onclick = () => { input.value = ''; showStatus(); dialog.showModal(); };
  document.querySelector('#ai-key-form').onsubmit = event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value || /\s/.test(value)) { status.textContent = 'Inserisci una chiave valida, senza spazi.'; return; }
    try { localStorage.setItem(API_KEY_STORAGE, value); key = value; input.value = ''; showStatus(); refresh(); }
    catch { status.textContent = 'Impossibile salvare la chiave. Verifica le impostazioni del browser.'; }
  };
  document.querySelector('#ai-key-forget').onclick = () => {
    try {
      localStorage.removeItem(API_KEY_STORAGE); key = ''; input.value = '';
      pending?.controller.abort(); showStatus(); refresh();
    } catch { status.textContent = 'Impossibile eliminare la chiave dal browser. Riprova.'; }
  };
  dialog.addEventListener('close', () => { input.value = ''; });
}

export function mountAnalysis(team) { visibleTeam = team; refresh(); }
function refresh() {
  const host = document.querySelector('#ai-analysis');
  if (!host || !visibleTeam) return;
  const team = visibleTeam;
  const entry = analyses.get(team.id) ?? { matchday: '', rules: '' };
  analyses.set(team.id, entry);
  const busy = pending?.teamId === team.id;
  host.innerHTML = `<div class="content-card compact ai-card"><p class="eyebrow">IL TUO CONSULENTE DI FANTACALCIO</p><h2>Analizza la giornata con AI</h2>
    <p class="ai-description">DeepSeek ricerca notizie e statistiche aggiornate e propone titolari, panchina e alternative. La rosa viene inviata a Fireworks; si applicano i costi del tuo account, inclusa l’eventuale ricerca web.</p>
    <label for="ai-matchday">Giornata da analizzare</label><input id="ai-matchday" maxlength="120" placeholder="Prossima giornata non ancora iniziata" value="${escape(entry.matchday)}" ${busy ? 'disabled' : ''}>
    <p class="field-hint">L’analisi usa il regolamento salvato per questa squadra. <a href="#regole" class="text-button">Modifica regole →</a></p>
    <div class="ai-actions"><button id="ai-analyze" class="button button-primary" ${pending || !key ? 'disabled' : ''}>${busy ? 'Ricerca e analisi in corso…' : 'Analizza la giornata'}</button>${busy ? '<button id="ai-cancel" class="button button-outline">Annulla</button>' : ''}<button id="ai-configure" class="button button-outline">Impostazioni AI</button></div>
    <p role="status">${!key ? 'Aggiungi la tua chiave API per iniziare.' : pending && !busy ? 'È in corso l’analisi di un’altra squadra.' : busy ? 'L’analisi può richiedere alcuni minuti. Puoi continuare a usare l’app.' : ''}</p>
    ${entry.error ? `<p class="import-error" role="alert">${escape(entry.error)}</p>` : ''}
    ${entry.result ? `<section class="ai-result"><h3>Consiglio per ${escape(entry.teamName)}</h3><p class="field-hint">${escape(entry.date)} · ${escape(entry.analyzedMatchday || 'Prossima giornata')} · Da verificare prima della consegna. La formazione attuale non è stata modificata.</p>${entry.fingerprint !== fingerprint(team) ? '<p class="import-error">La rosa o il regolamento sono cambiati dopo questa analisi. Esegui una nuova ricerca.</p>' : ''}<div class="ai-result-text">${escape(entry.result.text)}</div>${entry.result.sources.length ? `<h3>Fonti</h3><ul>${entry.result.sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a></li>`).join('')}</ul>` : '<p class="field-hint">Nessuna fonte strutturata restituita: controlla gli eventuali riferimenti nel testo.</p>'}</section>` : ''}</div>`;
  host.querySelector('#ai-configure').onclick = () => document.querySelector('#ai-settings-open').click();
  host.querySelector('#ai-matchday').oninput = event => { entry.matchday = event.target.value; };
  host.querySelector('#ai-cancel')?.addEventListener('click', () => pending?.controller.abort());
  host.querySelector('#ai-analyze').onclick = async () => {
    if (pending) return;
    const snapshot = structuredClone(team);
    const controller = new AbortController();
    const matchday = entry.matchday;

    pending = { teamId: team.id, controller };
    entry.error = '';
    refresh();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 180000);
    try {
      const result = await analyzeSquad({ key, team: snapshot, matchday, signal: controller.signal });
      if (controller.signal.aborted) throw new Error('Aborted');
      Object.assign(entry, { result, teamName: snapshot.name, analyzedMatchday: matchday, fingerprint: fingerprint(snapshot), date: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) });
    } catch (error) {
      entry.error = controller.signal.aborted ? (timedOut ? 'Tempo massimo raggiunto. Riprova più tardi.' : 'Analisi annullata. Fireworks potrebbe aver già elaborato la richiesta.') : error.message;
    } finally { clearTimeout(timeout); pending = null; refresh(); }
  };
}
