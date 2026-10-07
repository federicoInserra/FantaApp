import { HOSTED_API } from './deployment.mjs';
import { CloudSync, BACKUP_KEY } from './cloud-sync.mjs';
import { cloudState, mergeTeams } from './cloud-state.mjs';
import { RULE_GROUPS, teamRules } from './rules.mjs';
import { setupAnalysis, mountAnalysis } from './analysis-ui.mjs';
import { LISTS, loadCatalog, filterCatalog, hasPlayer, rosterPlayer } from './catalog.mjs';
import { FORMATIONS, ROLES, playerScore, suggestLineup } from './lineup.mjs';

import { readState, writeState } from './storage.mjs';
import { createTeam, parseTeamText, MAX_IMPORT_BYTES } from './import-team.mjs';
const roleOrder = ['P', 'D', 'C', 'A'];
function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function initialState() { return { teams: [], activeTeamId: null }; }
let state, cloud;
function cloudStatus({mode,message}) {
  const labels={loading:'Connessione al cloud…',saved:'Salvato nel cloud',saving:'Salvataggio nel cloud…',pending:'Salvato sul dispositivo · in attesa',offline:'Salvato sul dispositivo · cloud non disponibile',conflict:'Conflitto: sincronizzazione sospesa',import:'Squadre locali da importare'};
  document.querySelector('.save-indicator').textContent=labels[mode];
  document.querySelector('#storage-status').textContent=message||labels[mode];
  const needsAction=['offline','conflict','import'].includes(mode);
  document.querySelector('#cloud-banner').hidden=!needsAction;
  document.querySelector('#cloud-message').textContent=message||labels[mode];
  document.querySelector('#cloud-import-local').hidden=!['import','conflict'].includes(mode);
  document.querySelector('#cloud-import-local').textContent=mode==='conflict'?'Recupera squadre locali come copie':'Importa squadre locali nel cloud';
  document.querySelector('#cloud-use-remote').hidden=!['import','conflict'].includes(mode);
  document.querySelectorAll('#cloud-controls button').forEach(b=>b.disabled=['loading','saving'].includes(mode));
}
try {
  if(HOSTED_API){cloud=new CloudSync({storage:localStorage,onStatus:cloudStatus});await cloud.refresh();state=cloud.state;}
  else state=await readState(initialState);
}
catch (error) {
  document.querySelector('#app').textContent = 'Impossibile aprire il archivio locale. Riapri l’app senza cancellare i dati. ' + error.message;
  document.querySelector('#storage-status').textContent = 'Archivio non disponibile: nessun dato è stato sostituito.';
  document.querySelector('.save-indicator').textContent = 'Archivio non disponibile';
  throw error;
}
const pages = ['panoramica', 'rosa', 'formazione', 'regole'];
let page = 'panoramica';
let roleFilter = 'Tutti';
let rosterQuery = '';
const app = document.querySelector('#app');

function save() {
  const status = document.querySelector('#storage-status');
  const indicator = document.querySelector('.save-indicator');
  try {
    if(cloud)cloud.save(state);else writeState(state);
    if(!cloud) { status.textContent = 'Squadre salvate su questo dispositivo.';
    indicator.textContent = 'Salvato sul dispositivo'; }
    document.querySelector('#storage-error').hidden = true;
    return true;
  } catch {
    status.textContent = 'Salvataggio non riuscito. Mantieni aperta l’app e riprova.';
    indicator.textContent = 'Non salvato';
    document.querySelector('#storage-error').hidden = false;
    return false;
  }
}
function activeTeam() { return state.teams.find(team => team.id === state.activeTeamId) ?? state.teams[0]; }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function formatScore(value) { return value == null ? '—' : Number(value).toFixed(1).replace('.', ','); }
function button(label, action, className = 'button button-primary') { return `<button class="${className}" type="button" data-action="${action}">${label}</button>`; }
function roleBadge(role) { return `<span class="role-badge role-${role}">${role}</span>`; }
function pageHeader(kicker, title, description, action = '') { return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><${page === 'panoramica' ? 'h1' : 'h2'}>${title}</${page === 'panoramica' ? 'h1' : 'h2'}><p class="heading-description">${description}</p></div>${action}</div>`; }
function listLabel(team) { return team.listSource ? LISTS[team.listSource] : 'Listone da scegliere'; }
function teamContext(team) {
  return `<a class="back-link" href="#panoramica">← Le mie squadre</a>
    <div class="team-context"><h1>${escapeHTML(team.name)}</h1><button class="button button-quiet" type="button" data-action="team-options" aria-label="Gestisci ${escapeHTML(team.name)}">Gestisci</button></div>
    <nav class="team-nav" aria-label="Sezioni della squadra">${[['rosa', 'Rosa'], ['formazione', 'Formazione'], ['regole', 'Regole']].map(([target, label]) => `<a href="#${target}/${encodeURIComponent(team.id)}" ${page === target ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}
function renderOverview() {
  return `${pageHeader('IL TUO FANTACALCIO', 'Le mie squadre', 'Scegli una squadra per aprire la rosa.', state.teams.length ? button('+ Nuova squadra', 'new-team') : '')}
    ${state.teams.length ? `<div class="teams-grid">${state.teams.map((team, index) => `<a class="team-card" href="#rosa/${encodeURIComponent(team.id)}"><div class="team-card-top"><span class="team-number">${String(index + 1).padStart(2, '0')}</span><span class="eyebrow">${escapeHTML(listLabel(team))}</span></div><h2>${escapeHTML(team.name)}</h2><p>${team.players.length ? `${team.players.length} ${team.players.length === 1 ? 'giocatore' : 'giocatori'}` : 'Rosa da completare'}</p><div class="team-card-bottom"><span class="team-role-counts">${roleOrder.map(role => `<span>${roleBadge(role)} ${team.players.filter(player => player.role === role).length}</span>`).join('')}</span><span aria-hidden="true">↗</span></div></a>`).join('')}</div>` : `<section class="welcome-card"><img src="./icons/pixel-ball.svg" alt="" width="120" height="120"><h2>La prima squadra.<br>Si parte da qui.</h2><p>Scegli un nome e un listone. Puoi importare la rosa o aggiungere i giocatori più tardi.</p>${button('+ Crea la tua squadra', 'new-team')}</section>`}
    <p class="local-note">${HOSTED_API ? 'Le squadre si sincronizzano nel tuo archivio privato. Controlla lo stato di salvataggio in alto.' : 'Le squadre sono salvate solo su questo dispositivo.'}</p>`;
}
function rosterResults(team) {
  const query = rosterQuery.trim().toLocaleLowerCase('it');
  const players = team.players.filter(player => (roleFilter === 'Tutti' || player.role === roleFilter) && `${player.name} ${player.club}`.toLocaleLowerCase('it').includes(query));
  if (!players.length) return `<div class="empty-state"><h3>Nessun giocatore trovato</h3><p>Prova un altro nome o cambia il filtro.</p>${button('Mostra tutti', 'clear-filters', 'button button-outline')}</div>`;
  return roleOrder.map(role => {
    const group = players.filter(player => player.role === role).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    return group.length ? `<section class="roster-group" aria-label="${ROLES[role]}"><h2>${ROLES[role]} <span>${group.length}</span></h2><ul class="player-list">${group.map(player => `<li><button class="player-row" type="button" data-action="player-details" data-id="${escapeHTML(player.id)}">${roleBadge(role)}<span class="player-identity"><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.club)}</small></span>${player.available === false ? '<span class="absence-tag">Assente</span>' : ''}<span class="row-chevron" aria-hidden="true">›</span></button></li>`).join('')}</ul></section>` : '';
  }).join('');
}
function renderRoster(team) {
  return `<div class="roster-heading"><div><p>${team.players.length} ${team.players.length === 1 ? 'giocatore' : 'giocatori'}</p><span>${escapeHTML(listLabel(team))}</span></div>${team.players.length ? button('+ Giocatore', 'new-player') : ''}</div>
    ${team.players.length ? `<div class="roster-toolbar"><label class="sr-only" for="roster-search">Cerca nella rosa</label><input id="roster-search" type="search" placeholder="Cerca nome o club" value="${escapeHTML(rosterQuery)}" autocomplete="off"><div class="filter-tabs" role="group" aria-label="Filtra per ruolo">${['Tutti', ...roleOrder].map(role => `<button type="button" data-filter="${role}" aria-pressed="${roleFilter === role}" aria-label="${role === 'Tutti' ? 'Tutti i ruoli' : ROLES[role]}" class="${roleFilter === role ? 'active' : ''}">${role}</button>`).join('')}</div></div><div id="roster-results">${rosterResults(team)}</div>` : `<section class="empty-roster"><span class="empty-symbol" aria-hidden="true">＋</span><h2>La tua rosa comincia qui</h2><p>La squadra è pronta. Scegli i giocatori dal listone ${escapeHTML(listLabel(team))}.</p>${button('Aggiungi giocatori', 'new-player')}</section>`}`;
}

function renderFormation(team) {
  const lineup = suggestLineup(team.players, team.formation);
  const count = Object.values(lineup.starters).flat().length;
  return `${pageHeader('PRONTA PER IL CAMPO', 'La formazione', 'Prepara l’undici e chiedi un consiglio aggiornato per la prossima giornata.')}
    <div id="ai-analysis"></div><div class="formation-layout"><section class="pitch-card"><div class="pitch-card-head"><div><p class="eyebrow">UNDICI SUGGERITO</p><h2>${escapeHTML(team.formation)} <span>· ${count}/11</span></h2></div><span class="demo-tag">BOZZA INDICATIVA</span></div><div class="pitch" aria-label="Formazione suggerita">${['A', 'C', 'D', 'P'].map(role => `<div class="pitch-line">${lineup.starters[role].map(player => `<div class="pitch-player"><span class="pitch-player-icon">${role}</span><strong>${escapeHTML(player.name.split(' ').at(-1))}</strong><small>${formatScore(playerScore(player))}</small></div>`).join('')}${Array.from({ length: lineup.missing[role] }, () => `<div class="pitch-player pitch-empty"><span class="pitch-player-icon">+</span><strong>Da aggiungere</strong></div>`).join('')}</div>`).join('')}<div class="pitch-center"></div></div><p class="pitch-caption">Punteggio demo = 55% forma + 45% media voto, solo quando presenti. I giocatori senza statistiche sono ordinati per nome dopo quelli con punteggio demo: questa bozza non è una raccomandazione basata su dati reali. Gli assenti sono esclusi.</p></section>
    <aside class="formation-side"><section class="content-card compact"><p class="eyebrow">SCELTA DEL MODULO</p><h2>Come scendiamo in campo?</h2><label class="select-label" for="formation-select">Modulo</label><select id="formation-select">${Object.keys(FORMATIONS).map(formation => `<option value="${formation}" ${team.formation === formation ? 'selected' : ''}>${formation}</option>`).join('')}</select><p class="field-hint">La proposta si aggiorna quando cambi modulo o disponibilità.</p></section><section class="content-card compact"><p class="eyebrow">RIEPILOGO</p><h2>${lineup.complete ? 'Formazione completa' : 'Mancano giocatori'}</h2><div class="role-summary">${roleOrder.map(role => `<div><span>${roleBadge(role)} ${ROLES[role]}</span><strong>${lineup.starters[role].length}/${FORMATIONS[team.formation]?.[role] ?? FORMATIONS['3-4-3'][role]}</strong></div>`).join('')}</div>${button('Vai alla rosa <span>→</span>', 'go-roster', 'text-button')}</section></aside></div>`;
}

function renderRules(team) {
  let index = 0;
  const rules = teamRules(team);
  return `${pageHeader('REGOLAMENTO / PER SQUADRA', 'Le tue regole', 'Modifica ogni regola per questa squadra. Il regolamento salvato viene usato automaticamente dall’analisi AI.')}
    <p class="data-note">${HOSTED_API ? 'Le modifiche vengono salvate nel cloud quando sei online.' : 'Le modifiche sono salvate su questo dispositivo.'} Svuota una regola per escluderla dall’analisi. Le altre squadre mantengono il proprio regolamento.</p>
    <div class="rules-grid">${RULE_GROUPS.map(group => `<section class="content-card compact"><h2>${escapeHTML(group.title)}</h2>${group.rules.map(() => {
      const i = index++;
      return `<label class="rules-label" for="rule-${i}">Regola ${i + 1}</label><textarea id="rule-${i}" data-rule-index="${i}" rows="${rules[i].length > 160 ? 5 : 2}" maxlength="2000">${escapeHTML(rules[i])}</textarea>`;
    }).join('')}</section>`).join('')}</div><p id="rules-save-status" role="status"></p>`;
}
app.addEventListener('input', event => {
  const index = event.target.dataset.ruleIndex;
  if (index === undefined) return;
  const team = activeTeam();
  team.rules = [...teamRules(team)];
  team.rules[Number(index)] = event.target.value;
  document.querySelector('#rules-save-status').textContent = save() ? (HOSTED_API ? 'Regolamento salvato sul dispositivo. Controlla lo stato cloud in alto.' : 'Regolamento salvato per questa squadra.') : 'Salvataggio non riuscito. Mantieni aperta l’app e riprova.';
});

function render() {
  const team = activeTeam();
  if (!team && page !== 'panoramica') page = 'panoramica';
  document.querySelector('#breadcrumb').textContent = page === 'panoramica' ? 'Le mie squadre' : team.name;
  document.title = `${page === 'panoramica' ? 'Le mie squadre' : team.name} · FantaApp`;
  app.innerHTML = `<div class="page-content">${page === 'panoramica' ? renderOverview() : teamContext(team) + ({ rosa: renderRoster, formazione: renderFormation, regole: renderRules })[page](team)}</div>`;
  if (page === 'formazione') mountAnalysis(team);
}
function readRoute() {
  const [target, encodedId] = location.hash.slice(1).split('/');
  page = pages.includes(target) ? target : 'panoramica';
  if (encodedId) {
    let id;
    try { id = decodeURIComponent(encodedId); } catch { page = 'panoramica'; }
    if (state.teams.some(team => team.id === id)) { state.activeTeamId = id; save(); }
    else page = 'panoramica';
  }
  roleFilter = 'Tutti'; rosterQuery = '';
  render();
}
function navigate(target) {
  const hash = target === 'panoramica' ? '#panoramica' : `#${target}/${encodeURIComponent(activeTeam().id)}`;
  if (location.hash === hash) { page = target; render(); }
  else location.hash = hash;
}
function showPlayer(id) {
  const player = activeTeam()?.players.find(item => item.id === id);
  if (!player) return;
  document.querySelector('#player-detail-content').innerHTML = `<p class="eyebrow">${ROLES[player.role]}</p><h2 id="player-detail-title">${escapeHTML(player.name)}</h2><p>${escapeHTML(player.club)}</p><div class="player-availability"><span>Disponibilità</span><button type="button" class="button button-outline" data-action="toggle-player" data-id="${escapeHTML(id)}" aria-pressed="${player.available !== false}">${player.available === false ? 'Assente' : 'Disponibile'}</button></div><p class="field-hint">Tocca per cambiare la disponibilità. Gli assenti vengono esclusi dalla formazione.</p><button class="button button-quiet danger-action" type="button" data-action="remove-player" data-id="${escapeHTML(id)}">Rimuovi dalla rosa</button>`;
  const dialog = document.querySelector('#player-detail-dialog');
  dialog.dataset.playerId = id;
  if (!dialog.open) dialog.showModal();
}
document.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    roleFilter = filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === filter); item.setAttribute('aria-pressed', String(item === filter)); });
    document.querySelector('#roster-results').innerHTML = rosterResults(activeTeam());
    return;
  }
  const actionElement = event.target.closest('[data-action]'); if (!actionElement) return;
  const { action, id } = actionElement.dataset;
  if (action === 'retry-save') save();
  if (action === 'new-team') { document.querySelector('#team-dialog').showModal(); document.querySelector('#team-name').focus(); }
  if (action === 'app-settings') document.querySelector('#app-settings-dialog').showModal();
  if (action === 'team-options') {
    document.querySelector('#edit-team-name').value = activeTeam().name;
    document.querySelector('#team-options-list').textContent = listLabel(activeTeam());
    document.querySelector('#team-options-dialog').showModal();
  }
  if (action === 'remove-team') {
    const team = activeTeam();
    if (confirm(`Eliminare ${team.name} e tutti i suoi giocatori?`)) {
      const previous = structuredClone(state);
      state.teams = state.teams.filter(item => item.id !== team.id); state.activeTeamId = state.teams[0]?.id ?? null;
      if (!save()) { state = previous; return; }
      document.querySelector('#team-options-dialog').close(); navigate('panoramica');
    }
  }
  if (action === 'new-player') openCatalog();
  if (action === 'go-formation') navigate('formazione');
  if (action === 'go-roster') navigate('rosa');
  if (action === 'player-details') showPlayer(id);
  if (action === 'clear-filters') { roleFilter = 'Tutti'; rosterQuery = ''; render(); document.querySelector('#roster-search')?.focus(); }
  if (action === 'toggle-player') {
    const player = activeTeam().players.find(item => item.id === id);
    if (player) { const previous = player.available; player.available = player.available === false; if (!save()) player.available = previous; render(); showPlayer(id); document.querySelector('#player-detail-content [data-action="toggle-player"]').focus(); }
  }
  if (action === 'remove-player') {
    const team = activeTeam(); const player = team.players.find(item => item.id === id);
    if (player && confirm(`Rimuovere ${player.name} dalla rosa?`)) {
      const previous = team.players; team.players = team.players.filter(item => item.id !== id);
      if (!save()) { team.players = previous; return; }
      document.querySelector('#player-detail-dialog').close(); render(); app.focus();
    }
  }
});
app.addEventListener('input', event => {
  if (event.target.id === 'roster-search') { rosterQuery = event.target.value; document.querySelector('#roster-results').innerHTML = rosterResults(activeTeam()); }
});
document.querySelector('#team-options-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#edit-team-name');
  if (!input.value.trim()) { input.setCustomValidity('Inserisci un nome.'); input.reportValidity(); return; }
  const team = activeTeam(); const previous = team.name; team.name = input.value.trim();
  if (!save()) { team.name = previous; return; }
  document.querySelector('#team-options-dialog').close(); render();
});
document.querySelector('#edit-team-name').addEventListener('input', event => event.target.setCustomValidity(''));
document.querySelector('#player-detail-dialog').addEventListener('close', event => {
  const row = [...document.querySelectorAll('[data-action="player-details"]')].find(item => item.dataset.id === event.target.dataset.playerId);
  (row ?? app).focus({ preventScroll: true });
});
document.querySelector('#player-dialog').addEventListener('close', () => {
  (document.querySelector('[data-action="new-player"]') ?? app).focus({ preventScroll: true });
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

app.addEventListener('change', event => { if (event.target.id === 'team-select') { state.activeTeamId = event.target.value; save(); render(); } if (event.target.id === 'formation-select') { activeTeam().formation = event.target.value; save(); render(); } });
window.addEventListener('hashchange', () => { readRoute(); window.scrollTo(0, 0); app.focus({ preventScroll: true }); });
setupAnalysis();
if(!cloud)save(); readRoute();
setupCloudControls();

let catalogPlayers = [];
let catalogTeamId;
let catalogRequest = 0;
async function openCatalog() {
  const team = activeTeam();
  if (!team.listSource) { document.querySelector('#list-dialog').showModal(); return; }
  catalogTeamId = team.id;
  const request = ++catalogRequest;
  catalogPlayers = [];
  document.querySelector('#catalog-source').textContent = LISTS[team.listSource];
  document.querySelector('#catalog-search').value = '';
  document.querySelector('#catalog-role').value = '';
  document.querySelector('#catalog-out').checked = false;
  document.querySelector('#catalog-results').replaceChildren();
  document.querySelector('#catalog-count').textContent = 'Caricamento listone…';
  document.querySelector('#player-dialog').showModal();
  document.querySelector('#catalog-search').focus();
  try {
    const players = await loadCatalog(team.listSource);
    if (request !== catalogRequest) return;
    catalogPlayers = players;
    renderCatalog();
  } catch {
    if (request !== catalogRequest) return;
    document.querySelector('#catalog-count').textContent = 'Impossibile caricare il listone. Riprova con una connessione Internet.';
    document.querySelector('#catalog-results').innerHTML = '<button type="button" class="button button-outline" id="catalog-retry">Riprova</button>';
    document.querySelector('#catalog-retry').onclick = () => { document.querySelector('#player-dialog').close(); openCatalog(); };
  }
}
function renderCatalog() {
  const team = state.teams.find(item => item.id === catalogTeamId);
  if (!team) return;
  const matches = filterCatalog(catalogPlayers, document.querySelector('#catalog-search').value,
    document.querySelector('#catalog-role').value, document.querySelector('#catalog-out').checked);
  document.querySelector('#catalog-count').textContent = `${matches.length} giocatori · ${team.players.length} nella tua rosa`;
  document.querySelector('#catalog-results').innerHTML = matches.length ? matches.map(player => {
    const added = hasPlayer(team, player);
    return `<div class="catalog-row">${roleBadge(player.role)}<div><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.club)} · Quot. ${player.quotation}${player.outOfList ? ' · Fuori lista' : ''}${player.trequartista ? ' · Trequartista' : ''}${player.mantraRoles ? ` · Mantra: ${escapeHTML(player.mantraRoles)}` : ''}</small></div><button type="button" class="button button-outline" data-catalog-id="${escapeHTML(player.id)}" ${added ? 'disabled' : ''} aria-label="${added ? 'In rosa' : 'Aggiungi'} ${escapeHTML(player.name)}">${added ? 'In rosa' : '+ Aggiungi'}</button></div>`;
  }).join('') : '<p>Nessun giocatore trovato. Prova un altro nome, club o ruolo.</p>';
}
document.querySelector('#catalog-search').addEventListener('input', renderCatalog);
document.querySelector('#catalog-role').addEventListener('change', renderCatalog);
document.querySelector('#catalog-out').addEventListener('change', renderCatalog);
document.querySelector('#catalog-results').addEventListener('click', event => {
  const button = event.target.closest('[data-catalog-id]');
  if (!button) return;
  const team = state.teams.find(item => item.id === catalogTeamId);
  const player = catalogPlayers.find(item => item.id === button.dataset.catalogId);
  if (!team || !player || hasPlayer(team, player)) return;
  team.players.push(rosterPlayer(player));
  if (!save()) { team.players.pop(); document.querySelector('#catalog-count').textContent = 'Salvataggio non riuscito. Il giocatore non è stato aggiunto. Riprova.'; return; }
  render(); renderCatalog();
});
document.querySelector('#list-form').addEventListener('submit', event => {
  event.preventDefault();
  const source = event.currentTarget.elements.listSource.value;
  if (!Object.hasOwn(LISTS, source)) return;
  activeTeam().listSource = source;
  save(); render();
  document.querySelector('#list-dialog').close();
  openCatalog();
});

let pendingImport;
let importPreviewRequest = 0;
let importLoading = false;
const teamDialog = document.querySelector('#team-dialog');
const teamForm = document.querySelector('#team-form');
const importFile = document.querySelector('#import-file');
const importText = document.querySelector('#import-text');
const importError = document.querySelector('#import-error');
const importPreview = document.querySelector('#import-preview-content');
const createButton = document.querySelector('#team-create');
function resetImport(clearText = true) {
  importPreviewRequest++;
  pendingImport = null;
  importLoading = false;
  importFile.value = '';
  if (clearText) importText.value = '';
  importPreview.replaceChildren();
  importError.hidden = true;
  createButton.disabled = false;
}
document.querySelector('#team-import-toggle').addEventListener('click', () => {
  const fields = document.querySelector('#team-import-fields');
  fields.hidden = !fields.hidden;
  document.querySelector('#team-import-toggle').setAttribute('aria-expanded', String(!fields.hidden));
  if (!fields.hidden) importText.focus();
});
document.querySelector('#import-clear').addEventListener('click', () => resetImport());
async function previewImport() {
  const file = importFile.files?.[0];
  resetImport();
  if (!file) return;
  const request = importPreviewRequest;
  importLoading = true;
  createButton.disabled = true;
  try {
    if (!/\.txt$/i.test(file.name)) throw new Error('Seleziona un file con estensione .txt.');
    if (file.size > MAX_IMPORT_BYTES) throw new Error('Il file è troppo grande. Il limite è 64 KB.');
    importPreview.textContent = 'Lettura del file…';
    const buffer = await file.arrayBuffer();
    if (request !== importPreviewRequest) return;
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('Salva il file come testo semplice UTF-8 e riprova.'); }
    importText.value = text;
    previewPastedText();
  } catch (error) {
    if (request !== importPreviewRequest) return;
    pendingImport = null;
    importPreview.replaceChildren();
    importError.textContent = (error.message || 'Impossibile leggere il file.') + ' Scegli un altro file o rimuovi l’importazione per creare una rosa vuota.';
    importError.hidden = false;
  } finally {
    if (request === importPreviewRequest) importLoading = false;
  }
}
function previewPastedText() {
  resetImport(false);
  if (!importText.value.trim()) return;
  createButton.disabled = true;
  try {
    pendingImport = parseTeamText(importText.value);
    const counts = roleOrder.map(role => `${role}: ${pendingImport.players.filter(p => p.role === role).length}`).join(' · ');
    importPreview.innerHTML = `<section class="import-roster"><h3>${pendingImport.players.length} giocatori da importare</h3><p>${counts}</p><ul>${pendingImport.players.map(player => `<li>${roleBadge(player.role)} <strong>${escapeHTML(player.name)}</strong><span>${escapeHTML(player.club)}</span></li>`).join('')}</ul></section>`;
    createButton.disabled = false;
  } catch (error) {
    importError.textContent = error.message + ' Correggi il testo o rimuovi l’importazione per creare una rosa vuota.';
    importError.hidden = false;
  }
}
importText.addEventListener('input', previewPastedText);
importFile.addEventListener('change', previewImport);
teamDialog.addEventListener('close', () => {
  resetImport(); teamForm.reset();
  document.querySelector('#team-import-fields').hidden = true;
  document.querySelector('#team-import-toggle').setAttribute('aria-expanded', 'false');
});
teamForm.addEventListener('submit', event => {
  event.preventDefault();
  if (importLoading || createButton.disabled || !teamForm.reportValidity()) return;
  const previous = structuredClone(state);
  try {
    const team = createTeam({ name: teamForm.elements.name.value, listSource: teamForm.elements.listSource.value, imported: pendingImport }, uid);
    state.teams.push(team);
    state.activeTeamId = team.id;
    if (!save()) {
      state = previous;
      throw new Error('Salvataggio non riuscito. La squadra non è stata creata. Mantieni aperta l’app e riprova.');
    }
    teamDialog.close();
    navigate('rosa');
  } catch (error) {
    state = previous;
    importError.textContent = error.message || 'Impossibile creare la squadra.';
    importError.hidden = false;
  }
});


function downloadBackup(value,name='fantaapp-squadre') {
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),state:cloudState(value)},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${name}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setupCloudControls() {
  const feedback=document.querySelector('#teams-transfer-status');
  document.querySelector('#cloud-controls').hidden=!cloud;
  if(cloud)document.querySelector('#storage-help').textContent='Archivio privato condiviso tra i tuoi dispositivi. Le modifiche offline restano qui finché la sincronizzazione riesce. In caso di conflitto puoi recuperarle come copie senza sovrascrivere il cloud.';
  document.querySelector('#cloud-banner-open').onclick=()=>document.querySelector('#app-settings-dialog').showModal();
  document.querySelector('#teams-export').onclick=()=>downloadBackup(state);
  const recovery=document.querySelector('#teams-export-recovery');
  recovery.hidden=!localStorage.getItem(BACKUP_KEY);
  recovery.onclick=()=>downloadBackup(JSON.parse(localStorage.getItem(BACKUP_KEY)),'fantaapp-recupero');
  const runCloud=async(operation)=>{
    const ok=await operation();state=cloud.state;readRoute();recovery.hidden=!localStorage.getItem(BACKUP_KEY);
    feedback.textContent=ok?'Squadre sincronizzate.':'Sincronizzazione non completata. Controlla lo stato sopra.';
  };
  document.querySelector('#cloud-refresh').onclick=()=>runCloud(()=>cloud.refresh());
  document.querySelector('#cloud-import-local').onclick=()=>runCloud(()=>cloud.importLocal(state));
  document.querySelector('#cloud-use-remote').onclick=()=>runCloud(()=>cloud.useCloud());
  document.querySelector('#teams-import').onchange=async(event)=>{
    const file=event.target.files?.[0];if(!file)return;
    try {
      if(file.size>1000000)throw new Error('Il backup supera 1 MB.');
      const data=JSON.parse(await file.text()),incoming=cloudState(data.state??data);
      if(cloud)await runCloud(()=>cloud.importLocal(incoming));
      else {const merged=mergeTeams(state,incoming);writeState(merged);state=merged;readRoute();feedback.textContent='Backup importato. Le squadre esistenti sono state conservate.';}
    }catch(error){feedback.textContent=error.message||'Backup non valido.';}
    finally{event.target.value='';}
  };
  window.addEventListener('online',()=>{if(cloud?.entry.dirty && !cloud.conflict)void cloud.flush();});
}
