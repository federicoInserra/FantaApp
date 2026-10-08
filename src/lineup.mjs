export const FORMATIONS = {
  '3-4-3': { P: 1, D: 3, C: 4, A: 3 },
  '3-5-2': { P: 1, D: 3, C: 5, A: 2 },
  '4-3-3': { P: 1, D: 4, C: 3, A: 3 },
  '4-4-2': { P: 1, D: 4, C: 4, A: 2 },
  '4-5-1': { P: 1, D: 4, C: 5, A: 1 },
  '5-2-3': { P: 1, D: 5, C: 2, A: 3 },
  '5-4-1': { P: 1, D: 5, C: 4, A: 1 },
  '5-3-2': { P: 1, D: 5, C: 3, A: 2 },
};

export const ROLES = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };

const invalidLineup = () => { throw new Error('Formazione AI non valida. La proposta precedente è stata conservata. Riprova l’analisi.'); };
// Shape validation also works for saved recommendations whose roster has since changed.
export function storedLineup(data) {
  const ids = (value, max) => Array.isArray(value) && value.length <= max && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 150);
  if (!data || !Object.hasOwn(FORMATIONS, data.formation) || !ids(data.starters, 11) || !ids(data.bench, 100)) invalidLineup();
  const all = [...data.starters, ...data.bench];
  if (new Set(all).size !== all.length) invalidLineup();
  return { formation: data.formation, starters: [...data.starters], bench: [...data.bench] };
}
// Never repair a malformed AI lineup by replacing its choices with the demo selection.
export function validateLineup(data, players) {
  const lineup = storedLineup(data), byId = new Map(players.map(player => [player.id, player]));
  if ([...lineup.starters, ...lineup.bench].some(id => !byId.has(id) || byId.get(id).available === false)) invalidLineup();
  const starters = {}, missing = {}, slots = FORMATIONS[lineup.formation];
  for (const role of Object.keys(ROLES)) {
    starters[role] = lineup.starters.map(id => byId.get(id)).filter(player => player.role === role);
    const available = players.filter(player => player.role === role && player.available !== false).length;
    if (starters[role].length !== Math.min(slots[role], available)) invalidLineup();
    missing[role] = slots[role] - starters[role].length;
  }
  const complete = Object.values(missing).every(count => count === 0);
  if (!complete && Object.values(FORMATIONS).some(module => Object.entries(module).every(([role, count]) => players.filter(p => p.role === role && p.available !== false).length >= count))) invalidLineup();
  return { ...lineup, starters, bench: lineup.bench.map(id => byId.get(id)), missing, complete };
}

export function playerScore(player) {
  if (player.form == null || player.vote == null) return null;
  return Number(player.form) * 0.55 + Number(player.vote) * 0.45;
}

export function suggestLineup(players, formation = '3-4-3') {
  const slots = FORMATIONS[formation] ?? FORMATIONS['3-4-3'];
  const starters = {};
  const missing = {};
  for (const role of Object.keys(ROLES)) {
    starters[role] = players
      .filter(player => player.role === role && player.available !== false)
      .sort((a, b) => playerScore(b) - playerScore(a) || a.name.localeCompare(b.name, 'it'))
      .slice(0, slots[role]);
    missing[role] = Math.max(0, slots[role] - starters[role].length);
  }
  return { starters, missing, complete: Object.values(missing).every(count => count === 0) };
}
