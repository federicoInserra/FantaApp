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
