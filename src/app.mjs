import { FORMATIONS, ROLES, playerScore, suggestLineup } from './lineup.mjs';

const STORAGE_KEY = 'fantaapp.demo.v1';
const roleOrder = ['P', 'D', 'C', 'A'];
const demoPlayers = [
  ['P', 'Alessandro Conti', 'Milano', 8.2, 7.5], ['P', 'Luca Moretti', 'Torino', 6.8, 6.9],
  ['D', 'Davide Ferri', 'Napoli', 8.6, 7.4], ['D', 'Matteo Greco', 'Roma', 7.8, 7.1], ['D', 'Riccardo Serra', 'Bologna', 7.4, 7.2], ['D', 'Andrea Fontana', 'Firenze', 6.9, 6.7], ['D', 'Simone Costa', 'Milano', 6.4, 6.8],
  ['C', 'Federico Romano', 'Milano', 9.1, 8.0], ['C', 'Pietro Gallo', 'Napoli', 8.4, 7.7], ['C', 'Enrico Villa', 'Roma', 7.9, 7.5], ['C', 'Nicolò Rinaldi', 'Bergamo', 7.3, 7.2], ['C', 'Gabriele Leone', 'Torino', 6.8, 6.9], ['C', 'Tommaso De Luca', 'Lecce', 6.3, 6.7],
  ['A', 'Leonardo Bianchi', 'Milano', 9.3, 8.2], ['A', 'Filippo Marchetti', 'Napoli', 8.7, 7.9], ['A', 'Edoardo Ricci', 'Roma', 8.0, 7.5], ['A', 'Samuele Bruno', 'Bologna', 7.2, 7.1],
];

function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function sampleTeam() { return { id: uid(), name: 'Atletico Fantasia', formation: '3-4-3', players: demoPlayers.map(([role, name, club, form, vote]) => ({ id: uid(), role, name, club, form, vote, available: true })) }; }
function initialState() { const team = sampleTeam(); return { teams: [team], activeTeamId: team.id }; }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.teams) && saved.teams.length && saved.teams.every(team => typeof team.id === 'string' && Array.isArray(team.players))) return saved;
  } catch { /* Start with demo data when storage is unavailable or malformed. */ }
  return initialState();
}

let state = loadState();
let page = ['panoramica', 'rosa', 'formazione', 'notizie'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'panoramica';
let roleFilter = 'Tutti';
const app = document.querySelector('#app');

function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* The UI remains usable for this session. */ } }
function activeTeam() { return state.teams.find(team => team.id === state.activeTeamId) ?? state.teams[0]; }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function formatScore(value) { return Number(value).toFixed(1).replace('.', ','); }
function button(label, action, className = 'button button-primary') { return `<button class="${className}" type="button" data-action="${action}">${label}</button>`; }
function roleBadge(role) { return `<span class="role-badge role-${role}">${role}</span>`; }
function pageHeader(kicker, title, description, action = '') { return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="heading-description">${description}</p></div>${action}</div>`; }
function teamPicker() { return `<div class="team-picker"><label for="team-select">SQUADRA ATTIVA</label><div class="team-select-row"><select id="team-select" aria-label="Seleziona squadra">${state.teams.map(team => `<option value="${escapeHTML(team.id)}" ${team.id === activeTeam().id ? 'selected' : ''}>${escapeHTML(team.name)}</option>`).join('')}</select>${button('+ Nuova squadra', 'new-team', 'button button-outline')}${state.teams.length > 1 ? button('Elimina squadra', 'remove-team', 'button button-quiet') : ''}</div></div>`; }

function renderOverview(team) {
  const lineup = suggestLineup(team.players, team.formation);
  const available = team.players.filter(player => player.available !== false).length;
  const starting = Object.values(lineup.starters).flat().length;
  return `${pageHeader('BENVENUTO NELLA TUA PANCHINA', 'Il tuo fantacalcio,<br><em>tutto sotto controllo.</em>', 'Organizza la rosa, scegli il modulo e prepara la prossima formazione.', button('Prepara la formazione <span>↗</span>', 'go-formation'))}
    ${teamPicker()}
    <div class="hero-grid">
      <section class="feature-card"><div class="feature-card-top"><span class="feature-icon">✦</span><span class="feature-label">LA TUA SQUADRA</span></div><h2>${escapeHTML(team.name)}</h2><p>Ogni grande giornata comincia da una buona scelta.</p><div class="feature-card-bottom"><span>MODULO ATTUALE <strong>${escapeHTML(team.formation)}</strong></span><span class="decorative-ball">⚽</span></div></section>
      <section class="next-card"><div class="card-heading"><span class="card-icon">▦</span><span>Formazione suggerita</span></div><strong>${starting}<small>/11</small></strong><p>${lineup.complete ? 'Tutti i ruoli sono coperti. La tua formazione è pronta.' : 'Aggiungi giocatori disponibili per completare l’undici.'}</p>${button('Vedi formazione <span>→</span>', 'go-formation', 'text-button')}</section>
    </div>
    <div class="section-title-row"><div><p class="eyebrow">A COLPO D’OCCHIO</p><h2>I numeri della rosa</h2></div>${button('Gestisci la rosa <span>→</span>', 'go-roster', 'text-button')}</div>
    <div class="stat-grid"><div class="stat-card"><span class="stat-icon stat-green">◉</span><span class="stat-label">GIOCATORI IN ROSA</span><strong>${team.players.length}</strong><small>Totale giocatori</small></div><div class="stat-card"><span class="stat-icon stat-orange">✓</span><span class="stat-label">DISPONIBILI</span><strong>${available}</strong><small>Pronti per la formazione</small></div><div class="stat-card"><span class="stat-icon stat-purple">▦</span><span class="stat-label">MODULO SCELTO</span><strong>${escapeHTML(team.formation)}</strong><small>Puoi cambiarlo quando vuoi</small></div></div>
    <div class="info-banner"><span>ⓘ</span><p><strong>Un ambiente per iniziare.</strong> Nomi, statistiche e notizie presenti nell’app sono esempi. I tuoi dati restano salvati in questo browser.</p></div>`;
}

function renderRoster(team) {
  const players = [...team.players].filter(player => roleFilter === 'Tutti' || player.role === roleFilter).sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name, 'it'));
  return `${pageHeader('GESTIONE SQUADRA', 'La tua rosa', 'Tutti i tuoi giocatori, in un solo posto.', button('+ Aggiungi giocatore', 'new-player'))}${teamPicker()}
    <div class="content-card"><div class="content-card-top"><div><p class="eyebrow">ELENCO GIOCATORI</p><h2>${team.players.length} giocatori in rosa</h2></div><div class="filter-tabs" role="group" aria-label="Filtra per ruolo">${['Tutti', ...roleOrder].map(role => `<button type="button" data-filter="${role}" class="${roleFilter === role ? 'active' : ''}">${role}</button>`).join('')}</div></div>
    ${players.length ? `<div class="table-wrap"><table><thead><tr><th>GIOCATORE</th><th>RUOLO</th><th>FORMA DEMO</th><th>MEDIA DEMO</th><th>DISPONIBILITÀ</th><th><span class="sr-only">Azioni</span></th></tr></thead><tbody>${players.map(player => `<tr><td><div class="player-cell"><span class="player-avatar">${escapeHTML(player.name.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.club)}</small></span></div></td><td>${roleBadge(player.role)}</td><td><span class="score">${formatScore(player.form)}</span></td><td>${formatScore(player.vote)}</td><td><button class="availability ${player.available === false ? 'unavailable' : ''}" type="button" data-action="toggle-player" data-id="${escapeHTML(player.id)}" aria-label="Cambia disponibilità di ${escapeHTML(player.name)}"><span></span>${player.available === false ? 'Assente' : 'Disponibile'}</button></td><td><button class="row-action" type="button" data-action="remove-player" data-id="${escapeHTML(player.id)}" aria-label="Rimuovi ${escapeHTML(player.name)}">×</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><span>◉</span><h3>Ancora nessun giocatore qui</h3><p>Aggiungi un giocatore o scegli un altro filtro.</p>${button('+ Aggiungi giocatore', 'new-player')}</div>`}</div>
    <p class="data-note">Le statistiche sono valori demo inseriti manualmente. Non sono aggiornamenti in tempo reale.</p>`;
}

function renderFormation(team) {
  const lineup = suggestLineup(team.players, team.formation);
  const count = Object.values(lineup.starters).flat().length;
  return `${pageHeader('PRONTA PER IL CAMPO', 'La formazione', 'Un suggerimento semplice basato sui valori demo della tua rosa.')}${teamPicker()}
    <div class="formation-layout"><section class="pitch-card"><div class="pitch-card-head"><div><p class="eyebrow">UNDICI SUGGERITO</p><h2>${escapeHTML(team.formation)} <span>· ${count}/11</span></h2></div><span class="demo-tag">DATI DEMO</span></div><div class="pitch" aria-label="Formazione suggerita">${['A', 'C', 'D', 'P'].map(role => `<div class="pitch-line">${lineup.starters[role].map(player => `<div class="pitch-player"><span class="pitch-player-icon">${role}</span><strong>${escapeHTML(player.name.split(' ').at(-1))}</strong><small>${formatScore(playerScore(player))}</small></div>`).join('')}${Array.from({ length: lineup.missing[role] }, () => `<div class="pitch-player pitch-empty"><span class="pitch-player-icon">+</span><strong>Da aggiungere</strong></div>`).join('')}</div>`).join('')}<div class="pitch-center"></div></div><p class="pitch-caption">Punteggio = 55% forma demo + 45% media voto demo. I giocatori assenti sono esclusi.</p></section>
    <aside class="formation-side"><section class="content-card compact"><p class="eyebrow">SCELTA DEL MODULO</p><h2>Come scendiamo in campo?</h2><label class="select-label" for="formation-select">Modulo</label><select id="formation-select">${Object.keys(FORMATIONS).map(formation => `<option value="${formation}" ${team.formation === formation ? 'selected' : ''}>${formation}</option>`).join('')}</select><p class="field-hint">La proposta si aggiorna quando cambi modulo o disponibilità.</p></section><section class="content-card compact"><p class="eyebrow">RIEPILOGO</p><h2>${lineup.complete ? 'Formazione completa' : 'Mancano giocatori'}</h2><div class="role-summary">${roleOrder.map(role => `<div><span>${roleBadge(role)} ${ROLES[role]}</span><strong>${lineup.starters[role].length}/${FORMATIONS[team.formation]?.[role] ?? FORMATIONS['3-4-3'][role]}</strong></div>`).join('')}</div>${button('Vai alla rosa <span>→</span>', 'go-roster', 'text-button')}</section></aside></div>`;
}

function renderNews() {
  const news = [
    { category: 'CONSIGLIO DEMO', date: 'ESEMPIO', title: 'La forma recente può aiutare a scegliere', body: 'Confronta la forma e la media voto che hai inserito per valutare i tuoi titolari.' },
    { category: 'GUIDA DEMO', date: 'ESEMPIO', title: 'Scegli il modulo adatto alla tua rosa', body: 'Nella pagina Formazione puoi provare sei moduli. La proposta tiene conto dei ruoli disponibili.' },
    { category: 'PROMEMORIA DEMO', date: 'ESEMPIO', title: 'Segna gli assenti prima di schierare la squadra', body: 'Nella rosa puoi cambiare la disponibilità di ogni giocatore con un clic.' },
  ];
  return `${pageHeader('SEGNALI DAL CAMPO', 'Notizie & spunti', 'Uno spazio dimostrativo per contenuti e consigli futuri.')}<div class="news-notice"><span>ⓘ</span><div><strong>Contenuti dimostrativi</strong><p>Queste schede sono esempi editoriali. Non riportano notizie sportive aggiornate.</p></div></div><div class="news-grid">${news.map((item, index) => `<article class="news-card"><div class="news-art news-art-${index + 1}"><span>${['✦', '▦', '◉'][index]}</span></div><div class="news-content"><div class="news-meta"><span>${item.category}</span><span>${item.date}</span></div><h2>${item.title}</h2><p>${item.body}</p></div></article>`).join('')}</div>`;
}

function render() {
  const team = activeTeam();
  document.querySelector('#breadcrumb').textContent = ({ panoramica: 'Panoramica', rosa: 'La rosa', formazione: 'Formazione', notizie: 'Notizie demo' })[page];
  document.querySelectorAll('#main-nav a').forEach(link => { const active = link.dataset.page === page; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  app.innerHTML = `<div class="page-content">${({ panoramica: renderOverview, rosa: renderRoster, formazione: renderFormation, notizie: renderNews })[page](team)}</div>`;
}

function navigate(target) { page = target; location.hash = target; render(); document.querySelector('.sidebar').classList.remove('open'); document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
document.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter]'); if (filter) { roleFilter = filter.dataset.filter; render(); return; }
  const actionElement = event.target.closest('[data-action]'); if (!actionElement) return;
  const { action, id } = actionElement.dataset;
  if (action === 'new-team') { document.querySelector('#team-dialog').showModal(); document.querySelector('#team-name').focus(); }
  if (action === 'remove-team') { const team = activeTeam(); if (state.teams.length > 1 && confirm(`Eliminare ${team.name} e tutti i suoi giocatori?`)) { state.teams = state.teams.filter(item => item.id !== team.id); state.activeTeamId = state.teams[0].id; save(); render(); } }
  if (action === 'new-player') { document.querySelector('#player-dialog').showModal(); document.querySelector('#player-name').focus(); }
  if (action === 'go-formation') navigate('formazione');
  if (action === 'go-roster') navigate('rosa');
  if (action === 'toggle-player') { const player = activeTeam().players.find(item => item.id === id); if (player) { player.available = player.available === false; save(); render(); } }
  if (action === 'remove-player') { const team = activeTeam(); const player = team.players.find(item => item.id === id); if (player && confirm(`Rimuovere ${player.name} dalla rosa?`)) { team.players = team.players.filter(item => item.id !== id); save(); render(); } }
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelector('#team-form').addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget; const name = form.elements.name.value.trim(); if (!name) return; const team = { id: uid(), name, formation: '3-4-3', players: [] }; state.teams.push(team); state.activeTeamId = team.id; save(); form.reset(); document.querySelector('#team-dialog').close(); navigate('rosa'); });
document.querySelector('#player-form').addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget; const name = form.elements.name.value.trim(); const club = form.elements.club.value.trim(); const formValue = Number(form.elements.form.value); const voteValue = Number(form.elements.vote.value); if (!name || !club || ![formValue, voteValue].every(value => Number.isFinite(value) && value >= 1 && value <= 10)) return; activeTeam().players.push({ id: uid(), name, role: form.elements.role.value, club, form: formValue, vote: voteValue, available: true }); save(); form.reset(); document.querySelector('#player-dialog').close(); render(); });
app.addEventListener('change', event => { if (event.target.id === 'team-select') { state.activeTeamId = event.target.value; save(); render(); } if (event.target.id === 'formation-select') { activeTeam().formation = event.target.value; save(); render(); } });
document.querySelector('#menu-toggle').addEventListener('click', () => { const sidebar = document.querySelector('.sidebar'); const open = sidebar.classList.toggle('open'); document.querySelector('#menu-toggle').setAttribute('aria-expanded', String(open)); });
window.addEventListener('hashchange', () => { const target = location.hash.slice(1); if (['panoramica', 'rosa', 'formazione', 'notizie'].includes(target) && target !== page) { page = target; render(); document.querySelector('.sidebar').classList.remove('open'); document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false'); } });
save(); render();
