import { validRules } from './rules.mjs';

export function isValidState(value) {
  return Boolean(value && Array.isArray(value.teams) &&
    (value.importedImports === undefined || (Array.isArray(value.importedImports) && value.importedImports.every(key => typeof key === 'string'))) &&
    value.teams.every(team => typeof team.id === 'string' && typeof team.name === 'string' &&
      (team.listSource === undefined || ['fantamaster', 'leghe'].includes(team.listSource)) &&
      ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1'].includes(team.formation) &&
      (team.rules === undefined || validRules(team.rules)) &&
      Array.isArray(team.players) && team.players.every(player =>
        typeof player.id === 'string' && typeof player.name === 'string' && typeof player.club === 'string' &&
        ['P', 'D', 'C', 'A'].includes(player.role) &&
        [player.form, player.vote].every(score => score === null || (typeof score === 'number' && Number.isFinite(score) && score >= 1 && score <= 10)))));
}
