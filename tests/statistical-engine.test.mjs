import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeStatistical,ENGINE_ID,engineRules,playerForecast,seededRandom,sampleScenario,scoreCandidate,defensiveModifier,candidateLineups,fixtureForecasts,engineDeadlinePassed,effectiveKeeperParticipation} from '../src/statistical-engine.mjs';
import {defaultRules} from '../src/rules.mjs';
import {storedRecommendation,analysisFingerprint,withAnalysisResult} from '../src/analysis-state.mjs';
import {storedForecast} from '../src/forecast.mjs';
import {modelInfo} from '../src/ai-models.mjs';
import {buildFollowUpRequest,renderFollowUp} from '../src/follow-up.mjs';
import {recommendationView} from '../src/analysis-presentation.mjs';
import {statisticalFixture} from './fixtures/statistical.mjs';
const fixture=()=>statisticalFixture(new Date('2099-01-01T12:00:00Z'));
test('hard scoring rules fail closed; presentation/preferences and supported cap edits work',()=>{const {team}=fixture();assert.equal(engineRules(team).maxSubs,5);team.rules=defaultRules();team.rules[4]='Massimo 2 sostituzioni per giornata.';team.rules[14]='Preferisco 3-4-3';assert.equal(engineRules(team).maxSubs,2);team.rules[12]='Bonus gol +4';assert.throws(()=>engineRules(team),/non supportata/);assert.throws(()=>modelInfo(ENGINE_ID),/non supportato/);});
test('missing statistics shrink to explicit priors and fantasy averages cannot double count',()=>{const {team,research}=fixture();research.players[0].observations=[];const f=playerForecast(team.players[0],research);assert.equal(f.vote,6);assert.equal(f.participation,.75);assert.equal(f.missing,true);research.players[0].observations=[{field:'fantamedia',value:'99'}];assert.deepEqual(playerForecast(team.players[0],research),f);});
test('substitutions respect cap, same role and bench priorities; modifier is nonlinear',()=>{const rules=engineRules(fixture().team);const forecasts={p:{role:'P'},d:{role:'D'},r:{role:'D'},p2:{role:'P'}};const outcome=(role,rated,vote=6)=>({role,rated,vote,bonus:0,malus:0});const scenario={p:outcome('P',false),d:outcome('D',false),r:outcome('D',true,7),p2:outcome('P',true,6)};const c={starters:['p','d'],bench:['r','p2']};assert.equal(scoreCandidate(c,scenario,forecasts,{...rules,maxSubs:1}).total,6);assert.equal(scoreCandidate(c,scenario,forecasts,{...rules,maxSubs:0}).total,0);assert.equal(scoreCandidate(c,scenario,forecasts,rules).total,13);assert.equal(defensiveModifier([outcome('P',true,6.5),...Array.from({length:4},()=>outcome('D',true,6.5))]),3);assert.equal(defensiveModifier([outcome('P',true),...Array.from({length:3},()=>outcome('D',true,8))]),0);});
test('club goals and goalkeeper conceded/clean sheets are shared across player outcomes',()=>{const rules=engineRules(fixture().team);const base={participation:1,vote:6,goal:0,assist:0,yellow:0,red:0};const list=[{...base,id:'p',role:'P',club:'a',opponent:'b'},{...base,id:'q',role:'P',club:'a',opponent:'b'},{...base,id:'r',role:'P',club:'b',opponent:'a'}];const rng=seededRandom(4);for(let i=0;i<100;i++){const s=sampleScenario(list,rng,rules);assert.equal(Number(s.p.rated)+Number(s.q.rated),1);const keeper=s.p.rated?s.p:s.q;assert.equal(keeper.bonus,keeper.malus===0?1:0);const absent=s.p.rated?s.q:s.p;assert.equal(absent.bonus,0);assert.equal(absent.malus,0);}});
test('bounded candidates cover every formation and single swap exhaustive tractable alternatives',()=>{const {team,research}=fixture(),rules=engineRules(team),forecasts=Object.fromEntries(team.players.map(p=>[p.id,playerForecast(p,research)]));const cs=candidateLineups(team.players,forecasts,rules);assert.ok(cs.length<=136);assert.equal(new Set(cs.map(c=>c.formation)).size,8);const tiny=team.players.filter(p=>p.role==='P'?p.id==='P0':p.role==='D'?Number(p.id.slice(1))<5:p.role==='C'?Number(p.id.slice(1))<3:Number(p.id.slice(1))<3);const candidates=candidateLineups(tiny,forecasts,{...rules,formations:['4-3-3']});assert.equal(new Set(candidates.map(c=>c.starters.filter(id=>id.startsWith('D')).sort().join())).size,5);});
test('seeded engine is reproducible without provider/key and metadata survives save/reload',async()=>{const f=fixture();const a=await analyzeStatistical({...f,simulations:100}),b=await analyzeStatistical({...f,simulations:100});assert.deepEqual(a,b);storedForecast(a.forecast,a.lineup);const rec=storedRecommendation({...a,version:2,id:'rec',createdAt:f.now.toISOString(),researchAt:f.research.completedAt,researchId:f.research.id,teamFingerprint:analysisFingerprint(f.team),matchday:f.matchday});assert.equal(rec.method,ENGINE_ID);assert.deepEqual(storedRecommendation(JSON.parse(JSON.stringify(rec))),rec);assert.equal(renderFollowUp({...f.team,research:f.research,recommendation:rec}),'');assert.throws(()=>buildFollowUpRequest({team:{...f.team,research:f.research,recommendation:rec},question:'Why?'}),/non una conversazione AI/);assert.match(recommendationView(rec,false),/Calcolo locale/);assert.equal(withAnalysisResult({teams:[{...f.team,research:f.research}]},f.team.id,'recommendation',rec,analysisFingerprint(f.team)).teams[0].recommendation.method,ENGINE_ID);assert.throws(()=>storedRecommendation({...rec,model:'statistical-engine'}));});
test('cancellation stops computation and invalid data/match deadlines fail before producing results',async()=>{const f=fixture(),controller=new AbortController();let progress=0;await assert.rejects(analyzeStatistical({...f,signal:controller.signal,onProgress:()=>{progress++;controller.abort();}}),/abort/i);assert.equal(progress,1);f.research.players[0].observations[0].value=f.now.toISOString();await assert.rejects(analyzeStatistical(f),/giornate iniziate/);await assert.rejects(analyzeStatistical({...fixture(),simulations:100000}),/Parametri/);const invalid=fixture();invalid.team.players[0].role='Por';await assert.rejects(analyzeStatistical(invalid),/rosa è cambiata|Classic/);});
test('incomplete rosters produce valid partial lineups and disclose missing slots',async()=>{const f=fixture();f.team.players=f.team.players.filter(p=>p.role!=='A');const {squadSignature}=await import('../src/research.mjs');f.research.signature=squadSignature(f.team);const result=await analyzeStatistical({...f,simulations:100});assert.ok(result.lineup.starters.length<11);assert.match(result.text,/Copertura formazione/);});

test('verified fixture rates use shrunk home/away matchup summaries and normalized identities',()=>{
 const list=[{club:'milan',opponent:'inter',kickoff:'2099-01-02T12:00:00Z'}];
 const summary=(xg,xga)=>({games:20,xgPerMatch:xg,xgaPerMatch:xga});
 const research={understat:{teams:[{id:'1',name:'AC Milan',home:summary(2.4,.7),away:summary(1,1)},{id:'2',name:'Inter',home:summary(1,1),away:summary(.8,2.1)}],fixtures:[{id:'fixture',homeId:'1',awayId:'2',completed:false,kickoff:list[0].kickoff}]}};
 const rates=fixtureForecasts(list,research);assert.equal(rates.milan.id,'fixture');assert.ok(rates.milan.rate>rates.inter.rate);assert.equal(rates.inter.fallback,false);
 research.understat.fixtures=[];assert.equal(fixtureForecasts(list,research).milan.rate,1.25);
 assert.equal(engineDeadlinePassed({players:[{observations:[{field:'kickoff',value:'2020-01-01T00:00:00Z'}]}]}),true);
});
test('a single attacker cannot receive both scoring and assist bonus for the same club goal',()=>{
 const rules=engineRules(fixture().team),f={id:'a',role:'A',club:'a',opponent:'b',participation:1,vote:6,goal:1.25,assist:1.25,yellow:0,red:0};
 const rng=seededRandom(55);for(let i=0;i<100;i++){const s=sampleScenario([f],rng,rules);assert.equal(s.a.bonus%3,0);}
});
test('engine research/result round trip through disposable database to a second device',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {createTeamStore}=await import('../server/team-store.mjs');const {handleTeams}=await import('../server/teams-api.mjs');const {DatabaseTeams}=await import('../src/cloud-sync.mjs');
 const pg=new PGlite();try{
 const store=createTeamStore(async(strings,...values)=>{let text=strings[0];values.forEach((v,i)=>{text+=`$${i+1}`+strings[i+1];});return(await pg.query(text,values)).rows;});
 const fetchImpl=(url,options={})=>handleTeams(new Request('https://app.test'+url,{...options,headers:{...options.headers,Origin:'https://app.test'}}),{store});
 const a=new DatabaseTeams({fetchImpl}),b=new DatabaseTeams({fetchImpl});const f=fixture();await a.load();await a.save({teams:[f.team],activeTeamId:f.team.id});
 await a.save(withAnalysisResult(a.state,f.team.id,'research',f.research,analysisFingerprint(f.team)));
 const r=await analyzeStatistical({...f,simulations:100});const rec={...r,version:2,id:'rec',createdAt:f.now.toISOString(),researchAt:f.research.completedAt,researchId:f.research.id,teamFingerprint:analysisFingerprint(f.team),matchday:f.matchday};
 await a.save(withAnalysisResult(a.state,f.team.id,'recommendation',rec,analysisFingerprint(f.team)));await b.load();assert.equal(b.state.teams[0].recommendation.method,ENGINE_ID);assert.deepEqual(b.state.teams[0].recommendation.engine,r.engine);
 const changed={...f.team,name:'changed'};assert.throws(()=>withAnalysisResult({teams:[{...changed,research:f.research}]},f.team.id,'recommendation',rec,analysisFingerprint(f.team)),/cambiate/);
 }finally{await pg.close();}
});
test('actual collector availability labels override starting labels; suspended never takes vote',()=>{
 const {team,research}=fixture(),player=team.players[0],row=research.players[0];row.observations.push({field:'availability',value:'Squalifica: una giornata'});assert.equal(playerForecast(player,research).participation,0);
 row.observations.at(-1).value='Infortunio: problema muscolare';assert.equal(playerForecast(player,research).participation,.4);
 row.observations.at(-1).value='In dubbio: da valutare';assert.equal(playerForecast(player,research).participation,.4);
 row.observations.at(-1).value='Indisponibile';assert.equal(playerForecast(player,research).participation,0);
});
test('every formation allocates starter alternatives across all four eligible roles',()=>{
 const {team,research}=fixture(),rules=engineRules(team),forecasts=Object.fromEntries(team.players.map(p=>[p.id,playerForecast(p,research)])),candidates=candidateLineups(team.players,forecasts,rules);
 for(const formation of rules.formations){const choices=candidates.filter(c=>c.formation===formation),base=choices[0];for(const role of ['P','D','C','A'])assert.ok(choices.some(c=>c.starters.some(id=>forecasts[id].role===role&&!base.starters.includes(id))),`${formation} lacks ${role} alternative`);}
});
test('full-round official deadline rejects generation before later roster kickoffs; legacy requires refresh',async()=>{
 const f=fixture();f.research.roundStartsAt=new Date(f.now.getTime()-60000).toISOString();assert.equal(engineDeadlinePassed(f.research,f.now.getTime()),true);await assert.rejects(analyzeStatistical(f),/giornata iniziata/);
 delete f.research.roundStartsAt;await assert.rejects(analyzeStatistical(f),/scadenza/);
 const {storedResearch}=await import('../src/analysis-state.mjs');assert.throws(()=>storedResearch({...fixture().research,roundStartsAt:'not a date'}));
});
test('malformed engine snapshot without forecast is rejected and pitch uses same mean as result',async()=>{
 const f=fixture(),r=await analyzeStatistical({...f,simulations:100});const rec={...r,version:2,id:'rec',createdAt:f.now.toISOString(),researchAt:f.research.completedAt,researchId:f.research.id,teamFingerprint:analysisFingerprint(f.team),matchday:f.matchday};
 const broken={...rec};delete broken.forecast;assert.throws(()=>storedRecommendation(broken));assert.throws(()=>storedRecommendation({...rec,engine:{...rec.engine,expected:100,p90:101}}));assert.throws(()=>storedRecommendation({...rec,engine:{...rec.engine,p10:rec.engine.p10-1}}));
 const {renderFormationLayout}=await import('../src/formation-view.mjs');const html=renderFormationLayout({...f.team,formation:r.lineup.formation,research:f.research,recommendation:rec},f.matchday,f.now.getTime());const {forecastTotals}=await import('../src/forecast.mjs');assert.equal(forecastTotals(storedRecommendation(rec).forecast).expected,r.engine.expected);
 const expected=r.engine.expected.toLocaleString('it-IT',{maximumFractionDigits:1});assert.ok(html.includes(`<strong>${expected}</strong>`));
});
test('joint same-club goalkeeper prior permits at most one vote and does not inflate coverage',()=>{
 const base={role:'P',club:'a',opponent:'b',vote:6,goal:0,assist:0,yellow:0,red:0},list=[{...base,id:'p',participation:.9},{...base,id:'q',participation:.55}],rng=seededRandom(44),rules=engineRules(fixture().team);let covered=0;
 for(let i=0;i<10000;i++){const s=sampleScenario(list,rng,rules),count=Number(s.p.rated)+Number(s.q.rated);assert.ok(count<=1);covered+=count;}
 assert.ok(covered/10000>.94&&covered/10000<.97);
});
test('owning backup preserves preferred keeper marginal and zero-substitution starter points',()=>{
 const base={role:'P',club:'a',opponent:'b',vote:6,goal:0,assist:0,yellow:0,red:0},p={...base,id:'p',participation:.9},q={...base,id:'q',participation:.55};
 const effective=effectiveKeeperParticipation([q,p]);assert.equal(effective.find(f=>f.id==='p').participation,.9);assert.ok(Math.abs(effective.find(f=>f.id==='q').participation-.055)<1e-12);assert.deepEqual(effectiveKeeperParticipation(effective),effective);
 const rules={...engineRules(fixture().team),maxSubs:0},c={starters:['p'],bench:['q']},forecasts={p,q};let without=0,withBackup=0;
 // Identical first club draws and preferred-player draws: no backup effect on its score.
 for(let seed=1;seed<=2000;seed++){
 const a=sampleScenario([p],seededRandom(seed),rules),b=sampleScenario([p,q],seededRandom(seed),rules);assert.equal(a.p.rated,b.p.rated);without+=scoreCandidate({starters:['p'],bench:[]},a,forecasts,rules).total;withBackup+=scoreCandidate(c,b,forecasts,rules).total;
 }
 assert.equal(withBackup,without);
});
