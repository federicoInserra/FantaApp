import {numberOrNull, seasonAt, validLeague} from '../src/understat.mjs';

export const OPTA_URL = 'https://theanalyst.com/competition/serie-a/stats';
const fail = () => { throw new Error('Opta Analyst unavailable or data format changed'); };
const round = n => Math.round(n * 10000) / 10000;
const per90 = (n, minutes) => n === null || !minutes ? null : round(n * 90 / minutes);
const identity = value => typeof value === 'string' && /^[a-z0-9]{10,40}$/.test(value) ? value : fail();
// Some players without an Opta UUID are represented by the site's numeric STATS ID.
const playerId = value => Number.isSafeInteger(value) && value > 0 ? `stats-${value}` : identity(value);
const numeric = value => numberOrNull(value);
const rows = value => Array.isArray(value) && value.length > 0 && value.length <= 2000 ? value : fail();
const index = (values, player = true) => {
  const map = new Map(rows(values).map(v => [player ? playerId(v.player_uuid) : identity(v.team_uuid), v]));
  if(map.size !== values.length) fail();
  return map;
};

// Download only the public page and the two files it references. Never use a client-supplied URL or feed key.
async function download(url, fetchImpl, signal, limit) {
  const response = await fetchImpl(url, {headers:{Accept:'application/json, text/html'},redirect:'error',signal});
  if(!response.ok) fail();
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      size += value.length;
      if(size > limit) fail();
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for(const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export function normalizeOpta(playerData, teamData, season, now = new Date()) {
  if(season !== seasonAt(now) || playerData?.league !== 'Italian Serie A' || teamData?.league !== 'Italian Serie A') fail();
  const dates = [playerData.lastUpdated, teamData.lastUpdated].map(date => {
    const age = now.getTime() - Date.parse(date);
    // Acquisition time alone must not make a stale provider file look fresh.
    if(typeof date !== 'string' || !Number.isFinite(age) || age < -60000 || age > 48 * 3600000) fail();
    return date;
  });
  const nonPenalty = index(playerData.attack?.nonPenalty), chances = index(playerData.possession?.chanceCreation);
  const defenses = index(teamData.defending?.overall, false);
  const teams = rows(teamData.attack?.overall).map(row => {
    const id = identity(row.team_uuid), defense = defenses.get(id);
    const games = numeric(row.played), xg = numeric(row.xg), xga = numeric(defense?.xg_against);
    if(!defense || games !== numeric(defense.played) || !Number.isInteger(games) || games < 0 || games > 38) fail();
    return {id,name:row.team,lastMatchAt:null,
      overall:{games,xg,xga,xgPerMatch:xg === null || !games ? null : round(xg/games),xgaPerMatch:xga === null || !games ? null : round(xga/games)},
      home:null,away:null};
  });
  const teamById = new Map(teams.map(t => [t.id,t]));
  const players = rows(playerData.attack?.overall).map(row => {
    const id = playerId(row.player_uuid), np = nonPenalty.get(id), chance = chances.get(id), team = teamById.get(row.team_uuid);
    if(!team || !np || !chance || [np,chance].some(p => p.team_uuid !== row.team_uuid || p.mins_played !== row.mins_played || p.apps !== row.apps)) fail();
    const minutes = numeric(row.mins_played), xg = numeric(row.xg), npxg = numeric(np.np_xg), xa = numeric(chance.xa);
    return {id,name:row.player,clubs:[team.name],teamIds:[team.id],games:numeric(row.apps),minutes,xg,npxg,xa,shots:numeric(row.shots),
      xgPer90:per90(xg,minutes),npxgPer90:per90(npxg,minutes),xaPer90:per90(xa,minutes)};
  });
  const goalkeepers = index(playerData.goalkeeping?.overall);
  for(const row of goalkeepers.values()) {
    const id = playerId(row.player_uuid), team = teamById.get(row.team_uuid);
    if(!team) fail();
    const existing = players.find(p=>p.id===id);
    if(existing) {
      if(existing.teamIds[0]!==team.id || existing.minutes!==numeric(row.mins_played)) fail();
      continue;
    }
    // Goalkeepers have their own table. Keep known minutes without inventing attacking zeros.
    players.push({id,name:row.player,clubs:[team.name],teamIds:[team.id],games:numeric(row.apps),minutes:numeric(row.mins_played),
      xg:null,npxg:null,xa:null,shots:null,xgPer90:null,npxgPer90:null,xaPer90:null});
  }
  const league = {version:1,provider:'Opta Analyst',league:'Serie_A',season,retrievedAt:now.toISOString(),
    updatedAt:dates.sort()[0],latestMatchAt:null,sourceUrl:OPTA_URL,players,teams,fixtures:[]};
  if(!validLeague(league)) fail();
  return league;
}

export async function fetchOpta({season, now = new Date(), fetchImpl = fetch, signal} = {}) {
  if(season !== seasonAt(now)) fail();
  const timeout = AbortSignal.timeout(12000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const html = await download(OPTA_URL, fetchImpl, combined, 2_000_000);
  const navigation = /class="hub-navigation-container"\s+data-attributes="([^"]+)"/.exec(html)?.[1];
  const attributes = /class="wp-block-sdapi-blocks-stats-page">\s*<script[^>]*class="data"[^>]*>[\s\S]*?<\/script>\s*<script[^>]*class="attributes"[^>]*>([^<]+)<\/script>/.exec(html)?.[1];
  if(!navigation || !attributes) fail();
  const nav = JSON.parse(navigation.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  if(nav.title !== 'Serie A' || nav.current_subpage?.slug !== 'stats' || nav.nav_dropdown?.selected !== `${season}/${season+1}`) fail();
  const config = JSON.parse(attributes);
  if(config.feed_resource !== 'soccerdata') fail();
  const calendar = identity(config.tmcl);
  const base = `https://dataviz.theanalyst.com/project-data/soccer/${calendar}`;
  const [players, teams] = await Promise.all(['player-stats','team-stats'].map(file =>
    download(`${base}/${file}.json`, fetchImpl, combined, 4_000_000).then(JSON.parse)));
  return normalizeOpta(players, teams, season, now);
}
