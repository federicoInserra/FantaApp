export const LISTS = { fantamaster: 'FantaMaster', leghe: 'Leghe' };
const requests = new Map();
export function loadCatalog(source) {
  if (!Object.hasOwn(LISTS, source)) return Promise.reject(new Error('Scegli un listone.'));
  if (!requests.has(source)) requests.set(source, fetch(new URL(`../data/${source}.json`, import.meta.url))
    .then(response => { if (!response.ok) throw new Error('Listone non disponibile.'); return response.json(); })
    .then(data => {
      if (data.source !== source || !Array.isArray(data.players) || !data.players.length) throw new Error('Listone non valido.');
      return data.players;
    }).catch(error => { requests.delete(source); throw error; }));
  return requests.get(source);
}
const normalize = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('it');
export function filterCatalog(players, query, role, includeOutOfList = false) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return players.filter(player => (includeOutOfList || !player.outOfList) &&
    (!role || player.role === role) && terms.every(term => normalize(`${player.name} ${player.club}`).includes(term)));
}
export function hasPlayer(team, player) {
  return team.players.some(item => item.catalogId === player.id ||
    (normalize(item.name) === normalize(player.name) && normalize(item.club) === normalize(player.club)));
}
export function rosterPlayer(player) {
  return { id: player.id, catalogId: player.id, name: player.name, club: player.club, role: player.role,
    form: null, vote: null, available: true };
}
