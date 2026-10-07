// Understat's public league endpoint supplies numeric data directly; no LLM extraction.
export const UNDERSTAT_URL_STORAGE = 'fantaapp.understat.url.v1';
const fail = () => { throw new Error('Formato Understat non valido: aggiornamento interrotto.'); };
const id = value => /^\d+$/.test(String(value)) ? String(value) : fail();
const name = value => typeof value === 'string' && value.trim() && value.length < 160 ? value.trim() : fail();
export function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!['number','string'].includes(typeof value) || (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value))) return fail();
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : fail();
}
const round = value => Math.round(value * 10000) / 10000;
const per90 = (value, minutes) => value === null || !minutes ? null : round(value * 90 / minutes);
export const seasonAt = date => date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return fail();
  const iso = value.replace(' ', 'T') + 'Z';
  if (!Number.isFinite(Date.parse(iso))) return fail();
  return iso;
}
function summarize(matches) {
  const games = matches.length;
  const total = key => !games || matches.some(m => m[key] === null) ? null : round(matches.reduce((sum,m) => sum + m[key],0));
  const xg = total('xg'), xga = total('xga');
  return { games, xg, xga, xgPerMatch: xg === null ? null : round(xg/games), xgaPerMatch: xga === null ? null : round(xga/games) };
}
export function normalizeLeague(raw, season, now = new Date()) {
  if (!Number.isInteger(season) || season < 2014 || season > seasonAt(now) || !Array.isArray(raw?.players) || !raw.players.length || raw.players.length > 2000 || !raw.teams || Array.isArray(raw.teams) || !Array.isArray(raw.dates) || !raw.dates.length) return fail();
  const teams = Object.values(raw.teams).map(t => {
    if (!Array.isArray(t.history)) return fail();
    const history = t.history.map(m => {
      const date = isoDate(m.date);
      if (!['h','a'].includes(m.h_a) || Date.parse(date) >= now.getTime()) return fail();
      return {date,venue:m.h_a,xg:numberOrNull(m.xG),xga:numberOrNull(m.xGA)};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    return {id:id(t.id),name:name(t.title),lastMatchAt:history.at(-1)?.date ?? null,overall:summarize(history),home:summarize(history.filter(m=>m.venue==='h')),away:summarize(history.filter(m=>m.venue==='a'))};
  });
  if (!teams.length || teams.length > 30) return fail();
  const teamByName = new Map(teams.map(t=>[t.name,t.id]));
  const players = raw.players.map(p => {
    const minutes = numberOrNull(p.time), xg = numberOrNull(p.xG), npxg = numberOrNull(p.npxG), xa = numberOrNull(p.xA);
    const clubs = name(p.team_title).split(',').map(s=>s.trim());
    // A transfer row can aggregate multiple clubs; retain that fact instead of treating it as current-club-only.
    return {id:id(p.id),name:name(p.player_name),clubs,teamIds:clubs.map(c=>teamByName.get(c)).filter(Boolean),games:numberOrNull(p.games),minutes,xg,npxg,xa,shots:numberOrNull(p.shots),xgPer90:per90(xg,minutes),npxgPer90:per90(npxg,minutes),xaPer90:per90(xa,minutes)};
  });
  const fixtures = raw.dates.map(m => {
    if (typeof m.isResult !== 'boolean') return fail();
    const kickoff = isoDate(m.datetime), homeId = id(m.h?.id), awayId = id(m.a?.id);
    if (!teams.some(t=>t.id===homeId) || !teams.some(t=>t.id===awayId) || homeId===awayId) return fail();
    if (Date.parse(kickoff) < Date.UTC(season,6,1) || Date.parse(kickoff) >= Date.UTC(season+1,6,1)) return fail();
    return {id:id(m.id),homeId,awayId,kickoff,completed:m.isResult};
  });
  for (const list of [teams,players,fixtures]) if (new Set(list.map(x=>x.id)).size !== list.length) return fail();
  const latestMatchAt = teams.map(t=>t.lastMatchAt).filter(Boolean).sort().at(-1) ?? null;
  return {version:1,provider:'Understat',league:'Serie_A',season,retrievedAt:now.toISOString(),latestMatchAt,sourceUrl:`https://understat.com/league/Serie_A/${season}`,players,teams,fixtures};
}
function canonical(value) { return String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
const CLUB_ALIASES = { milan:'ac milan', parma:'parma calcio 1913', verona:'hellas verona', inter:'inter', 'internazionale':'inter' };
function clubKey(value) { const key=canonical(value);return CLUB_ALIASES[key] ?? key; }
function nameMatches(rosterName, providerName) {
  // Verified provider spelling: Understat player 6692 is Enrico Del Prato.
  if (canonical(rosterName) === 'delprato') rosterName = 'Del Prato';
  const a=canonical(rosterName).split(' '),b=canonical(providerName).split(' ');
  // Whole words and initials only. Ambiguous results remain unresolved; no fuzzy guessing.
  return a.length && a.some(x=>x.length>1) && a.every(x=>b.some(y=>x===y || x.length===1 && y.startsWith(x)));
}
export function matchSquad(league, roster) {
  return roster.map(p=>{
    const clubs=league.teams.filter(t=>clubKey(t.name)===clubKey(p.club));
    const team=clubs.length===1 ? clubs[0] : null;
    const candidates=team ? league.players.filter(u=>u.teamIds.includes(team.id) && nameMatches(p.role === 'P' && canonical(p.name) === 'terracciano' ? 'Pietro Terracciano' : p.name,u.name)) : [];
    const player=candidates.length===1 ? candidates[0] : null;
    const reason = !team ? 'Club non trovato in Serie A.' : candidates.length>1 ? 'Nome ambiguo: serve il nome completo.' : !player ? 'Giocatore non trovato nel club indicato.' : [player.minutes,player.npxg,player.xa].some(v=>v===null) ? 'Statistiche giocatore incomplete.' : !player.minutes ? 'Nessun minuto registrato: valori per 90 non disponibili.' : !team.overall.games || team.overall.xg===null || team.overall.xga===null ? 'Statistiche squadra incomplete.' : '';
    return {rosterId:p.id,name:p.name,teamId:team?.id ?? null,player,reason};
  });
}
export function understatServiceURL(value) {
  try {
    const url=new URL(value.trim());
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol!=='https:' && !(url.protocol==='http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new Error('Inserisci l’URL HTTPS del servizio Understat (solo dominio), oppure localhost per lo sviluppo.'); }
}
export async function fetchUnderstat({serviceURL,season=seasonAt(new Date()),signal,fetchImpl=fetch,now=new Date()}) {
  if (!serviceURL) throw new Error('Configura il servizio Understat nelle impostazioni AI prima di aggiornare i dati.');
  const origin=understatServiceURL(serviceURL);
  let response;
  try { response=await fetchImpl(`${origin}/api/understat?season=${season}`,{method:'GET',credentials:'same-origin',referrerPolicy:'no-referrer',signal}); }
  catch(error) { if(signal?.aborted)throw error;throw new Error('Servizio Understat non raggiungibile. Verifica URL e connessione.'); }
  if(!response.ok) throw new Error(`Understat non disponibile (HTTP ${response.status}). Nessun dato stimato.`);
  const data=await response.json();
  // Relay returns only raw public fields plus its acquisition time; normalize again at the browser boundary.
  const acquiredAt=new Date(data.retrievedAt),age=now.getTime()-acquiredAt.getTime();
  if(data.season!==season || !Number.isFinite(age) || age < -60000 || age>15*60*1000) throw new Error('Risposta Understat scaduta o stagione errata.');
  return normalizeLeague(data.data,season,acquiredAt);
}
export function understatSnapshot(league, roster, now=new Date()) {
  const end=now.getTime()+14*86400000;
  return {...league,players:matchSquad(league,roster),fixtures:league.fixtures.filter(f=>!f.completed && Date.parse(f.kickoff)>=now.getTime() && Date.parse(f.kickoff)<end)};
}

export function validUnderstatSnapshot(data) {
  const number = n => n === null || typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const text = s => typeof s === 'string' && s.length < 200;
  const date = d => typeof d === 'string' && Number.isFinite(Date.parse(d));
  const summary = s => s && Number.isInteger(s.games) && s.games >= 0 && ['xg','xga','xgPerMatch','xgaPerMatch'].every(k=>number(s[k]));
  try {
    return data?.version===1 && data.provider==='Understat' && data.league==='Serie_A' && Number.isInteger(data.season) && data.season>=2014 && date(data.retrievedAt) && (data.latestMatchAt===null || date(data.latestMatchAt)) && data.sourceUrl===`https://understat.com/league/Serie_A/${data.season}` &&
      Array.isArray(data.players) && data.players.length<=40 && data.players.every(p=>text(p.rosterId) && text(p.name) && text(p.reason) && (p.player===null || text(p.player.id) && text(p.player.name) && Array.isArray(p.player.clubs) && p.player.clubs.every(text) && ['games','minutes','xg','npxg','xa','shots','xgPer90','npxgPer90','xaPer90'].every(k=>number(p.player[k])))) &&
      Array.isArray(data.teams) && data.teams.length>0 && data.teams.length<=30 && data.teams.every(t=>text(t.id)&&text(t.name)&&summary(t.overall)&&summary(t.home)&&summary(t.away)) &&
      Array.isArray(data.fixtures) && data.fixtures.length<=500 && data.fixtures.every(f=>text(f.id)&&text(f.homeId)&&text(f.awayId)&&date(f.kickoff)&&typeof f.completed==='boolean');
  } catch { return false; }
}
