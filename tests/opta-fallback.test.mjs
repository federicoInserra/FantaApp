import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchOpta, normalizeOpta, OPTA_URL} from '../worker/opta-source.mjs';
import {handleVercelUnderstat, createLeagueCache} from '../server/vercel-understat.mjs';
import {fetchUnderstat, understatSnapshot, validLeague} from '../src/understat.mjs';
import {researchSquad, staleReason} from '../src/research.mjs';
import {storedResearch} from '../src/analysis-state.mjs';
import {buildRequest} from '../src/analysis.mjs';
import {rawLeague, now} from './fixtures/understat.mjs';

// Synthetic data only; not a copy of the provider's player database.
const calendar = 'calendar2026example';
function fixture() {
  const who = {player_uuid:'playerexample01',team_uuid:'teamexample001',player:'Sample Player',apps:2,mins_played:180};
  const meta = {league:'Italian Serie A',lastUpdated:now.toISOString()};
  return {players:{...meta,attack:{overall:[{...who,xg:1.3,shots:4}],nonPenalty:[{...who,np_xg:0.9}]},possession:{chanceCreation:[{...who,xa:0.4}]},goalkeeping:{overall:[{...who,player_uuid:'keeperexample01',player:'Sample Keeper'}]}},
    teams:{...meta,attack:{overall:[{team_uuid:who.team_uuid,team:'Inter',played:2,xg:3}]},defending:{overall:[{team_uuid:who.team_uuid,played:2,xg_against:2}]}},
    html:`<div class="hub-navigation-container" data-attributes="{&quot;title&quot;:&quot;Serie A&quot;,&quot;current_subpage&quot;:{&quot;slug&quot;:&quot;stats&quot;},&quot;nav_dropdown&quot;:{&quot;selected&quot;:&quot;2026/2027&quot;}}"></div>
      <div class="wp-block-sdapi-blocks-stats-page"><script class="data" type="application/json">[]</script><script class="attributes" type="application/json">{"feed_resource":"soccerdata","tmcl":"${calendar}"}</script></div>`};
}
function upstream(data = fixture(), mode = 'html', calls = []) {
  return async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, 'error');
    if(url.startsWith('https://understat.com/')) {
      if(mode === 'ok') return Response.json(rawLeague());
      if(mode === 'network') throw new Error('private network details');
      if(mode === 'status') return new Response('private error', {status:503});
      if(mode === 'schema') return Response.json({players:[]});
      return new Response('<html>We will come back soon</html>');
    }
    if(url === OPTA_URL) return new Response(data.html);
    assert.ok(url.startsWith(`https://dataviz.theanalyst.com/project-data/soccer/${calendar}/`));
    if(url.endsWith('/player-stats.json')) return Response.json(data.players);
    if(url.endsWith('/team-stats.json')) return Response.json(data.teams);
    throw new Error('unexpected URL');
  };
}
const request = () => new Request('https://relay.example/api/understat?season=2026');

test('Opta normalizer joins by identity, calculates rates, and keeps unsupported fields absent', () => {
  const f = fixture(), league = normalizeOpta(f.players,f.teams,2026,now);
  assert.equal(validLeague(league),true);
  assert.equal(league.players[0].npxgPer90,0.45);
  assert.equal(league.players[0].xaPer90,0.2);
  assert.equal(league.teams[0].overall.xgaPerMatch,1);
  assert.equal(league.teams[0].home,null); assert.equal(league.teams[0].away,null);
  assert.equal(league.latestMatchAt,null); assert.deepEqual(league.fixtures,[]);
  assert.equal(league.players[1].name,'Sample Keeper');assert.equal(league.players[1].minutes,180);assert.equal(league.players[1].xg,null);
  f.players.attack.overall[0].mins_played=0;
  f.players.attack.nonPenalty[0].mins_played=0;
  f.players.possession.chanceCreation[0].mins_played=0;
  f.players.attack.overall[0].xg=0;f.players.possession.chanceCreation[0].xa=null;
  const zero=normalizeOpta(f.players,f.teams,2026,now).players[0];
  assert.equal(zero.xg,0);assert.equal(zero.xa,null);assert.equal(zero.npxgPer90,null);
  for(const rows of [f.players.attack.overall,f.players.attack.nonPenalty,f.players.possession.chanceCreation]) rows[0].player_uuid=12345;
  assert.equal(normalizeOpta(f.players,f.teams,2026,now).players[0].id,'stats-12345');
});

test('Opta rejects stale, wrong-league, mismatched, duplicate or malformed data', () => {
  for(const mutate of [
    f=>f.players.lastUpdated='2026-10-01T00:00:00Z',
    f=>f.teams.lastUpdated='2026-10-08T00:00:00Z',
    f=>f.players.league='English Premier League',
    f=>f.players.attack.nonPenalty[0].team_uuid='wrongteamexample',
    f=>f.players.possession.chanceCreation[0].mins_played=90,
    f=>f.players.attack.overall.push({...f.players.attack.overall[0]}),
    f=>f.players.possession.chanceCreation.push({...f.players.possession.chanceCreation[0]}),
    f=>f.players.goalkeeping.overall.push({...f.players.goalkeeping.overall[0]}),
    f=>f.players.attack.overall[0].xg=-1,
    f=>f.players.attack.overall[0].player=null,
    f=>f.teams.defending.overall=[]
  ]) {
    const f=fixture();mutate(f);assert.throws(()=>normalizeOpta(f.players,f.teams,2026,now));
  }
});

test('fallback validates season and discovered calendar, caps download size and never forwards credentials',async()=>{
  for(const mutate of [
    f=>f.html=f.html.replace('2026/2027','2025/2026'),
    f=>f.html=f.html.replace(calendar,'../../evil'),
    f=>f.html=f.html.replace('Serie A','Premier League'),
    f=>f.html='x'.repeat(2_000_001)
  ]) {
    const f=fixture();mutate(f);const calls=[];
    await assert.rejects(fetchOpta({season:2026,now,fetchImpl:upstream(f,'html',calls)}));
    assert.deepEqual(calls,[OPTA_URL]);
  }
  await assert.rejects(fetchOpta({season:2025,now,fetchImpl:()=>assert.fail('no fetch for other seasons')}));
});

test('Understat remains primary; HTML, HTTP, schema and network failures activate the fallback',async()=>{
  for(const mode of ['ok','html','status','schema','network']) {
    const calls=[], response=await handleVercelUnderstat(request(),{now,cache:createLeagueCache(),fetchImpl:upstream(fixture(),mode,calls)});
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    const body=await response.json();
    assert.equal(calls.length,mode==='ok'?1:4);
    const league=await fetchUnderstat({serviceURL:'https://relay.example',now,season:2026,fetchImpl:async()=>Response.json(body)});
    assert.equal(league.provider,mode==='ok'?'Understat':'Opta Analyst');
    assert.equal(understatSnapshot(league,[{id:'r',name:'Player S',club:'Inter'}],now).players[0].reason,'');
  }
});

test('fallback cache expires and retries Understat on recovery; both-provider errors stay safe',async()=>{
  let time=0;const cache=createLeagueCache(()=>time),calls=[];
  const fetchImpl=upstream(fixture(),'html',calls);
  for(let i=0;i<2;i++) assert.equal((await handleVercelUnderstat(request(),{now,cache,fetchImpl})).status,200);
  assert.equal(calls.length,4);
  time=300000;
  const recovered=await handleVercelUnderstat(request(),{now,cache,fetchImpl:upstream(fixture(),'ok',calls)});
  assert.equal((await recovered.json()).provider,undefined);assert.equal(calls.length,5);
  const failed=await handleVercelUnderstat(request(),{now,cache:createLeagueCache(),fetchImpl:async()=>{throw new Error('private error')}});
  assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('private error'));
  const controller=new AbortController();controller.abort();let count=0;
  await handleVercelUnderstat(new Request(request(),{signal:controller.signal}),{now,cache:createLeagueCache(),fetchImpl:async()=>{count++;throw new Error('abort')}});
  assert.equal(count,1);
});

test('fallback research survives persistence and analysis, without unsupported forecasts or false source labels',async()=>{
  const {parseStats,parseLineups}=await import('../server/fantacalcio-source.mjs');
  const {readFile}=await import('node:fs/promises');
  const players=parseStats(await readFile(new URL('./fixtures/fantacalcio-stats.html',import.meta.url),'utf8'),2026);
  const matches=parseLineups(await readFile(new URL('./fixtures/fantacalcio-lineups.html',import.meta.url),'utf8'),2026);
  const team={id:'one',listSource:'leghe',players:[{id:'r',name:'Delprato',club:'Parma',role:'D'},{id:'p',name:'Player S',club:'Inter',role:'A'}]};
  const response=await handleVercelUnderstat(request(),{now,cache:createLeagueCache(),fetchImpl:upstream()});
  const envelope=await response.json();
  const research=await researchSquad({team,now,understatURL:'https://relay.example',fetchImpl:async url=>url.includes('/api/understat')?Response.json(envelope):Response.json({version:1,season:2026,retrievedAt:now.toISOString(),players,matches,warnings:[]})});
  research.id='research-opta';research.completedAt=now.toISOString();
  const saved=storedResearch(JSON.parse(JSON.stringify(storedResearch(research))));
  assert.equal(saved.understat.provider,'Opta Analyst');assert.equal(saved.understat.updatedAt,now.toISOString());
  assert.equal(saved.understat.teams[0].home,null);
  assert.equal(staleReason(saved,team,'',now.getTime()),'');
  assert.equal(saved.sources.find(s=>s.id==='U1').title,'Opta Analyst · Serie A');
  assert.ok(saved.warnings.some(w=>w.includes('Understat non disponibile')));
  assert.ok(saved.players[0].observations.some(o=>o.field==='fantamedia'));
  assert.ok(!saved.players.some(p=>p.observations.some(o=>['starting','opponent','kickoff'].includes(o.field))));
  const input=JSON.parse(buildRequest(team,'','',now,saved).input);
  assert.equal(input.raccolta.understat.provider,'Opta Analyst');
  for(const mutate of [d=>d.understat.sourceUrl='https://evil.example',d=>d.understat.teams[0].home={games:0,xg:null,xga:null,xgPerMatch:null,xgaPerMatch:null}]) {
    const bad=structuredClone(saved);mutate(bad);assert.throws(()=>storedResearch(bad));
  }
  for(const mutate of [d=>d.league.players[0].teamIds=['unknown'],d=>d.league.players.push({...d.league.players[0]}),d=>d.league.updatedAt='2026-10-01T00:00:00Z']) {
    const bad=structuredClone(envelope);mutate(bad);
    await assert.rejects(fetchUnderstat({serviceURL:'https://relay.example',now,season:2026,fetchImpl:async()=>Response.json(bad)}),/Opta/);
  }
});
