import {withAnalysisResult} from './analysis-state.mjs';
import { DatabaseTeams } from './cloud-sync.mjs';
import { RULE_GROUPS, teamRules } from './rules.mjs';
import { setupAnalysis, mountAnalysis } from './analysis-ui.mjs';
import { LISTS, loadCatalog, filterCatalog, hasPlayer, rosterPlayer } from './catalog.mjs';
import { ROLES } from './lineup.mjs';
import {renderFormationLayout} from './formation-view.mjs';
import {renderPlayerAnalysis} from './player-analysis.mjs';

import { createTeam, parseTeamText, MAX_IMPORT_BYTES } from './import-team.mjs';
const roleOrder = ['P', 'D', 'C', 'A'];
function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
let state;
function cloudStatus({mode,message}) {
  const labels={loading:'Caricamento squadre…',saved:'Salvato nel database',saving:'Salvataggio…',error:'Database non disponibile'};
  document.querySelector('.save-indicator').textContent=labels[mode];
  document.querySelector('#storage-status').textContent=message||labels[mode];
  document.querySelector('#cloud-banner').hidden=mode!=='error';
  document.querySelector('#cloud-message').textContent=message||labels[mode];
}
const cloud=new DatabaseTeams({onStatus:cloudStatus});
await cloud.load();state=cloud.state;
const pages = ['panoramica', 'rosa', 'formazione', 'regole'];
let page = 'panoramica';
let roleFilter = 'Tutti';
let rosterQuery = '';
const app = document.querySelector('#app');

async function save() {
  const targets=[document.querySelector('#app'),...document.querySelectorAll('dialog')];
  targets.forEach(node=>node.inert=true);
  try {
    const activeId=state.activeTeamId;
    state=await cloud.save(state);state.activeTeamId=activeId;
    document.querySelector('#storage-error').hidden=true;
    return true;
  } catch(error) {
    state=cloud.state;
    document.querySelector('#storage-error').hidden=false;
    document.querySelector('#storage-error p').textContent=error.message;
    return false;
  } finally {targets.forEach(node=>node.inert=false);}
}
function activeTeam() { return state.teams.find(team => team.id === state.activeTeamId) ?? state.teams[0]; }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
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
    <p class="local-note">Squadre salvate nel tuo database privato.</p>`;
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
  return `${pageHeader('PRONTA PER IL CAMPO', 'La formazione', 'Prepara l’undici e chiedi un consiglio aggiornato per la prossima giornata.')}
    <div id="ai-analysis"></div><div id="formation-view">${renderFormationLayout(team)}</div>`;
}

function renderRules(team) {
  let index = 0;
  const rules = teamRules(team);
  return `${pageHeader('REGOLAMENTO / PER SQUADRA', 'Le tue regole', 'Modifica ogni regola per questa squadra. Il regolamento salvato viene usato automaticamente dall’analisi AI.')}
    <p class="data-note">Le modifiche vengono salvate nel database. Svuota una regola per escluderla dall’analisi. Le altre squadre mantengono il proprio regolamento.</p>
    <div class="rules-grid">${RULE_GROUPS.map(group => `<section class="content-card compact"><h2>${escapeHTML(group.title)}</h2>${group.rules.map(() => {
      const i = index++;
      return `<label class="rules-label" for="rule-${i}">Regola ${i + 1}</label><textarea id="rule-${i}" data-rule-index="${i}" rows="${rules[i].length > 160 ? 5 : 2}" maxlength="2000">${escapeHTML(rules[i])}</textarea>`;
    }).join('')}</section>`).join('')}</div><p id="rules-save-status" role="status"></p>`;
}
app.addEventListener('change', async event => {
  const index = event.target.dataset.ruleIndex;
  if (index === undefined) return;
  const team = activeTeam();
  team.rules = [...teamRules(team)];
  team.rules[Number(index)] = event.target.value;
  const saved=await save();
  const status=document.querySelector('#rules-save-status');
  if(status)status.textContent=saved?'Regolamento salvato nel database.':'Salvataggio non confermato. Ricarica le squadre.';
  if(!saved)render();
});

function render() {
  if(!cloud.ready){app.innerHTML='<section class="page-content"><h1>Squadre non disponibili</h1><p>È necessaria una connessione al database per aprire e modificare le squadre.</p><button class="button button-primary" data-action="reload-teams">Ricarica squadre</button></section>';return;}
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
    if (state.teams.some(team => team.id === id)) { state.activeTeamId = id; }
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
function showPlayer(id,fromPitch=false) {
  const player = activeTeam()?.players.find(item => item.id === id);
  if (!player) return;
  document.querySelector('#player-detail-content').innerHTML = `<p class="eyebrow">${ROLES[player.role]}</p><h2 id="player-detail-title">${escapeHTML(player.name)}</h2><p>${escapeHTML(player.club)}</p>${renderPlayerAnalysis(activeTeam(),id,{fromPitch,matchday:activeTeam().research?.matchday??''})}<div class="player-availability"><span>Disponibilità</span><button type="button" class="button button-outline" data-action="toggle-player" data-id="${escapeHTML(id)}" aria-pressed="${player.available !== false}">${player.available === false ? 'Assente' : 'Disponibile'}</button></div><p class="field-hint">Tocca per cambiare la disponibilità. Gli assenti vengono esclusi dalla formazione.</p><button class="button button-quiet danger-action" type="button" data-action="remove-player" data-id="${escapeHTML(id)}">Rimuovi dalla rosa</button>`;
  const dialog = document.querySelector('#player-detail-dialog');
  dialog.dataset.playerId = id;
  dialog.dataset.fromPitch=String(fromPitch);
  if (!dialog.open) dialog.showModal();
}
document.addEventListener('click', async event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    roleFilter = filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === filter); item.setAttribute('aria-pressed', String(item === filter)); });
    document.querySelector('#roster-results').innerHTML = rosterResults(activeTeam());
    return;
  }
  const actionElement = event.target.closest('[data-action]'); if (!actionElement) return;
  const { action, id } = actionElement.dataset;
  if (action === 'retry-save' || action === 'reload-teams') { await reloadTeams(); return; }
  if(cloud.busy)return;
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
      state.teams = state.teams.filter(item => item.id !== team.id); state.activeTeamId = state.teams[0]?.id ?? null;
      if (!await save()) { render(); return; }
      document.querySelector('#team-options-dialog').close(); navigate('panoramica');
    }
  }
  if (action === 'new-player') openCatalog();
  if (action === 'go-formation') navigate('formazione');
  if (action === 'go-roster') navigate('rosa');
  if (action === 'restore-recommendation') {
    activeTeam().formation=activeTeam().recommendation.lineup.formation;
    await save();render();
  }
  if (action === 'player-details') showPlayer(id,actionElement.dataset.origin==='pitch');
  if (action === 'clear-filters') { roleFilter = 'Tutti'; rosterQuery = ''; render(); document.querySelector('#roster-search')?.focus(); }
  if (action === 'toggle-player') {
    const player = activeTeam().players.find(item => item.id === id);
    if (player) { player.available = player.available === false; if (!await save()) render(); if(!cloud.ready)return; render(); showPlayer(id,document.querySelector('#player-detail-dialog').dataset.fromPitch==='true'); document.querySelector('#player-detail-content [data-action="toggle-player"]').focus(); }
  }
  if (action === 'remove-player') {
    const team = activeTeam(); const player = team.players.find(item => item.id === id);
    if (player && confirm(`Rimuovere ${player.name} dalla rosa?`)) {
      team.players = team.players.filter(item => item.id !== id);
      if (!await save()) { render(); return; }
      document.querySelector('#player-detail-dialog').close(); render(); app.focus();
    }
  }
});
app.addEventListener('input', event => {
  if (event.target.id === 'roster-search') { rosterQuery = event.target.value; document.querySelector('#roster-results').innerHTML = rosterResults(activeTeam()); }
});
document.querySelector('#team-options-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#edit-team-name');
  if (!input.value.trim()) { input.setCustomValidity('Inserisci un nome.'); input.reportValidity(); return; }
  const team = activeTeam(); team.name = input.value.trim();
  if (!await save()) { render(); return; }
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

app.addEventListener('change', async event => { if (event.target.id === 'team-select') { state.activeTeamId = event.target.value; render(); } if (event.target.id === 'formation-select') { activeTeam().formation = event.target.value; await save(); render(); } });
window.addEventListener('hashchange', () => { readRoute(); window.scrollTo(0, 0); app.focus({ preventScroll: true }); });
setupAnalysis({onContextChange:(team,matchday)=>{
  const host=document.querySelector('#formation-view');
  if(host&&page==='formazione'&&activeTeam()?.id===team.id)host.innerHTML=renderFormationLayout(team,matchday);
},saveResult:async(teamId,kind,result,expectedFingerprint)=>{
  const next=withAnalysisResult(state,teamId,kind,result,expectedFingerprint);
  if(cloud.busy||!cloud.ready)throw new Error('Database occupato o non disponibile. Ricarica le squadre.');
  state=next;
  if(!await save()){
    render();
    throw new Error('Salvataggio non confermato. Ricarica le squadre per verificare il risultato nel database.');
  }
  const saved=state.teams.find(t=>t.id===teamId);
  return structuredClone(saved);
}});
readRoute();
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
document.querySelector('#catalog-results').addEventListener('click', async event => {
  const button = event.target.closest('[data-catalog-id]');
  if (!button) return;
  const team = state.teams.find(item => item.id === catalogTeamId);
  const player = catalogPlayers.find(item => item.id === button.dataset.catalogId);
  if (!team || !player || hasPlayer(team, player)) return;
  team.players.push(rosterPlayer(player));
  if (!await save()) { render(); document.querySelector('#catalog-count').textContent = 'Salvataggio non confermato. Chiudi questa finestra e ricarica le squadre.'; return; }
  render(); renderCatalog();
});
document.querySelector('#list-form').addEventListener('submit', async event => {
  event.preventDefault();
  const source = event.currentTarget.elements.listSource.value;
  if (!Object.hasOwn(LISTS, source)) return;
  activeTeam().listSource = source;
  if(!await save()){render();return;} render();
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
teamForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (importLoading || createButton.disabled || !teamForm.reportValidity()) return;
  try {
    const team = createTeam({ name: teamForm.elements.name.value, listSource: teamForm.elements.listSource.value, imported: pendingImport }, uid);
    state.teams.push(team);
    state.activeTeamId = team.id;
    if (!await save()) {
      render();
      throw new Error('Salvataggio non confermato. Ricarica le squadre prima di riprovare.');
    }
    teamDialog.close();
    navigate('rosa');
  } catch (error) {
    importError.textContent = error.message || 'Impossibile creare la squadra.';
    importError.hidden = false;
  }
});


async function reloadTeams() {
  if(cloud.busy)return;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  await cloud.load();state=cloud.state;document.querySelector('#storage-error').hidden=true;readRoute();
}
function setupCloudControls() {
  document.querySelector('#cloud-banner-open').onclick=reloadTeams;
  document.querySelector('#cloud-refresh').onclick=reloadTeams;
}
