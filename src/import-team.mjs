import { defaultRules } from './rules.mjs';
export const MAX_IMPORT_BYTES = 64 * 1024;
const normalize = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it').replace(/[’‘]/g, "'");
function hash(value) {
  let result = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) result = BigInt.asUintN(64, (result ^ BigInt(byte)) * 0x100000001b3n);
  return result.toString(16).padStart(16, '0');
}

export function parseTeamText(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Il file deve contenere testo e non superare 64 KB.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).map((value, index) => ({ value: value.trim(), line: index + 1 })).filter(item => item.value);
  const header = lines[0]?.value.match(/^Squadra\s*:\s*(.+)$/i);
  if (!header) throw new Error('La prima riga deve essere “Squadra: Nome squadra”.');
  const name = header[1].trim();
  if (name.length > 32) throw new Error('Il nome della squadra non può superare 32 caratteri.');
  if (lines.length < 2) throw new Error('Il file non contiene giocatori. Aggiungi righe come “P - Maignan (Milan)”.');
  if (lines.length > 41) throw new Error('Puoi importare al massimo 40 giocatori per squadra.');
  const seen = new Set();
  const players = lines.slice(1).map(({ value, line }) => {
    const match = value.match(/^([PDCA])\s*[-–—]\s*(.+?)\s*\(([^()]+)\)\s*$/i);
    if (!match) throw new Error(`Riga ${line}: usa il formato “P - Maignan (Milan)” con ruolo P, D, C o A.`);
    const [, rawRole, rawName, rawClub] = match;
    const role = rawRole.toUpperCase(), name = rawName.trim(), club = rawClub.trim();
    if (!name || !club || name.length > 100 || club.length > 80 || /[\u0000-\u001F\u007F]/.test(name + club)) throw new Error(`Riga ${line}: nome o club non valido.`);
    const identity = JSON.stringify([normalize(name), normalize(club)]);
    if (seen.has(identity)) throw new Error(`Riga ${line}: ${name} (${club}) è presente più volte.`);
    seen.add(identity);
    return { id: `txt:${hash(identity)}`, name, club, role, form: null, vote: null, available: true };
  });
  const key = `txt:${hash(JSON.stringify([normalize(name), players.map(p => [p.id, p.role]).sort((a, b) => a[0].localeCompare(b[0]))]))}`;
  return { name, players, key };
}

export function createTeam({ name, listSource, imported }, makeId) {
  name = name.trim();
  if (!name || name.length > 32) throw new Error('Inserisci un nome squadra da 1 a 32 caratteri.');
  if (!['fantamaster', 'leghe'].includes(listSource)) throw new Error('Scegli un listone.');
  return { id: makeId(), name, listSource, formation: '4-3-3', rules: defaultRules(),
    ...(imported ? { importedFrom: 'txt' } : {}),
    players: imported ? imported.players.map(player => ({ ...player })) : [] };
}
