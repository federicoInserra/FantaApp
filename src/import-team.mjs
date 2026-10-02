const SOURCES = new Set(['fantamaster', 'leghe']);

export function importKey(name, source, ids) {
  const bytes = new TextEncoder().encode(`${source}|${name.trim().toLocaleLowerCase('it')}|${[...ids].sort().join('|')}`);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `${source}:${hash.toString(16).padStart(16, '0')}`;
}

export function validateImport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Codice squadra non valido.');
  const allowed = ['v', 'name', 'source', 'ids'];
  if (Object.keys(value).some(key => !allowed.includes(key)) || value.v !== 1 ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 32 ||
      !SOURCES.has(value.source) || !Array.isArray(value.ids) || !value.ids.length ||
      value.ids.length > 40 || value.ids.some(id => typeof id !== 'string') ||
      new Set(value.ids).size !== value.ids.length) throw new Error('Codice squadra incompleto o non valido.');
  const name = value.name.trim();
  return { v: 1, name, source: value.source, ids: [...value.ids], key: importKey(name, value.source, value.ids) };
}

export function decodeImportFragment(hash) {
  const match = String(hash).match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const encoded = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return validateImport(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { throw new Error('Link di importazione non valido o incompleto.'); }
}

export function encodeImportFragment(payload) {
  const data = validateImport(payload);
  const { key, ...linkPayload } = data;
  const bytes = new TextEncoder().encode(JSON.stringify(linkPayload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `#import=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function appendImportedTeam(state, payload, players, makeId) {
  if ((state.importedImports ?? []).includes(payload.key)) return { added: false, state };
  const byId = new Map(players.map(player => [player.id, player]));
  const importedPlayers = payload.ids.map(id => byId.get(id));
  if (importedPlayers.some(player => !player)) throw new Error('Il listone non contiene tutti i giocatori del codice.');
  const team = { id: makeId(), name: payload.name, listSource: payload.source, formation: '3-4-3',
    players: importedPlayers.map(player => ({ id: player.id, catalogId: player.id, name: player.name,
      club: player.club, role: player.role, form: null, vote: null, available: true })) };
  state.teams.push(team);
  state.activeTeamId = team.id;
  state.importedImports = [...(state.importedImports ?? []), payload.key];
  return { added: true, state, team };
}
