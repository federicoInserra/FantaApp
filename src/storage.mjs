export const LEGACY_KEY = 'fantaapp.demo.v1';

export function isValidState(value) {
  return Boolean(value && Array.isArray(value.teams) && value.teams.length &&
    value.teams.every(team => typeof team.id === 'string' && typeof team.name === 'string' &&
      (team.listSource === undefined || ['fantamaster', 'leghe'].includes(team.listSource)) &&
      ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2'].includes(team.formation) &&
      Array.isArray(team.players) && team.players.every(player =>
        typeof player.id === 'string' && typeof player.name === 'string' && typeof player.club === 'string' &&
        ['P', 'D', 'C', 'A'].includes(player.role) &&
        [player.form, player.vote].every(score => score === null || (typeof score === 'number' && Number.isFinite(score) && score >= 1 && score <= 10)))));
}

export function writeState(value) {
  if (!isValidState(value)) throw new Error('Dati della squadra non validi.');
  localStorage.setItem(LEGACY_KEY, JSON.stringify(value));
}

export function readState(createInitial) {
  const raw = localStorage.getItem(LEGACY_KEY);
  const state = raw === null ? createInitial() : JSON.parse(raw);
  if (!isValidState(state)) throw new Error('Archivio non leggibile. I dati originali sono stati conservati.');
  return state;
}
