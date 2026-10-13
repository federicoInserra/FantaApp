import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFantamasterVotes,collectFantamasterVotes,FANTAMASTER_PLAYERS_URL,FANTAMASTER_LIVE_URL,fantamasterVotesURL} from '../server/fantamaster-votes.mjs';
import {collectTeamMatchdayVotes} from '../server/team-matchday-votes.mjs';
import {actualLineupScore} from '../server/actual-lineup-score.mjs';
import {historyFixture,voteHTML} from './fixtures/history.mjs';
import {voteProvider} from '../src/vote-sources.mjs';
function fixture(){
  const f=historyFixture({matchday:6}),now=new Date('2026-10-13T12:00:00Z');f.record.listSource='fantamaster';
  const roster={players:f.votes.players.map((p,i)=>({id:1000+i,name:p.name,team:p.club,role:p.role}))};
  for(const team of f.votes.clubs)if(!roster.players.some(p=>p.team===team))roster.players.push({id:2000+roster.players.length,name:`Extra ${team}`,team,role:'A'});
  const ratings={day:6,maxday:6,ratings:roster.players.map(p=>({...p,mark:6,fmark:6,goal:0,penalty:0,assist:0,spenalty:0,mpenalty:0,owngoal:0,gotgoal:0,ycard:0,rcard:0}))};
  const calendar={season:2026,fixtures:Array.from({length:10},(_,i)=>({matchday:6,home:`Club ${i*2}`,away:`Club ${i*2+1}`,kickoff:'2026-10-12T18:00:00Z',status:'FINISHED'}))};
  const live={day:'6',scores:calendar.fixtures.map(()=>({rawdate:'2026-10-12 20:00',time:'FT',voting:'F'}))};
  const parse=()=>parseFantamasterVotes(ratings,roster,live,calendar,2026,6,{now});
  const fetchImpl=async(url)=>Response.json(url===FANTAMASTER_PLAYERS_URL?roster:url===FANTAMASTER_LIVE_URL?live:ratings);
  return {...f,now,roster,ratings,calendar,live,parse,fetchImpl};
}
test('FantaMaster scores use its own IDs/votes, pure-vote modifier and one keeper clean-sheet bonus',()=>{
  const f=fixture(),data=f.parse(),result=actualLineupScore(f.record,data);
  assert.equal(data.provider,'FantaMaster');assert.equal(data.complete,true);assert.equal(result.total,68);assert.equal(result.players[0].sourceId,'1000');assert.equal(result.players[0].points,7);
  const player=f.ratings.ratings.find(p=>p.name===f.record.players.find(p=>p.id==='A0').name);player.fmark=10;
  assert.equal(actualLineupScore(f.record,f.parse()).total,72);
  f.ratings.ratings[0].gotgoal=2;f.ratings.ratings[0].fmark=4;assert.equal(actualLineupScore(f.record,f.parse()).players[0].points,4);
});
test('known FantaMaster nonparticipants use ordered substitutes without reusing Fantacalcio identities',()=>{
  const f=fixture(),name=f.record.players.find(p=>p.id==='D0').name;
  f.ratings.ratings=f.ratings.ratings.filter(p=>p.name!==name);
  const result=actualLineupScore(f.record,f.parse());assert.equal(result.status,'complete');assert.deepEqual(result.substitutions,[{out:'D0',in:'D4'}]);
  f.roster.players=f.roster.players.filter(p=>p.name!==name);assert.equal(actualLineupScore(f.record,f.parse()).status,'pending');
});
test('ambiguous FantaMaster player matches and special no-vote events remain pending',()=>{
  const f=fixture(),player=f.roster.players[0];f.roster.players.push({...player,id:9999});
  assert.equal(actualLineupScore(f.record,f.parse()).status,'pending');
  f.roster.players.pop();f.ratings.ratings[0].mark=0;f.ratings.ratings[0].fmark=-1;f.ratings.ratings[0].rcard=1;
  assert.equal(actualLineupScore(f.record,f.parse()).status,'pending');
});
test('season anchor, exact requested round, finalized votes and full official match coverage are required',()=>{
  for(const mutate of [f=>f.live.scores[0].rawdate='2025-10-12 20:00',f=>f.live.day='5',f=>f.calendar.season=2025,f=>f.ratings.day=5,f=>f.calendar.fixtures.pop(),f=>f.ratings.ratings.push(f.ratings.ratings[0])]){
    const f=fixture();mutate(f);assert.throws(f.parse);
  }
  for(const mutate of [f=>f.calendar.fixtures[0].status='LIVE',f=>f.live.scores[0].voting='L',f=>f.live.scores[0].time='80',f=>f.ratings.ratings=f.ratings.ratings.filter(p=>p.team!=='Club 19')]){
    const f=fixture();mutate(f);assert.equal(f.parse().complete,false);
  }
  const past=fixture();past.ratings.maxday=7;past.live.day='7';past.live.scores[0].time='80';past.live.scores[0].voting='L';assert.equal(past.parse().complete,true);
});
test('malformed votes, IDs and event counts cannot become complete scores',()=>{
  for(const mutate of [f=>f.ratings.ratings[0].mark=99,f=>f.ratings.ratings[0].gotgoal=null,f=>f.ratings.ratings[0].id='1000',f=>f.roster.players[0].role='ALL',f=>f.ratings.ratings[0].fmark='6']){
    const f=fixture();mutate(f);assert.throws(f.parse);
  }
});
test('collector uses bounded public feeds with timeout signals and rejects upstream failures',async()=>{
  const f=fixture(),calls=[];
  const options={now:f.now,useCache:false,calendarCollector:async()=>f.calendar,fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.ok(options.signal);return f.fetchImpl(url);}};
  assert.equal((await collectFantamasterVotes(2026,6,options)).complete,true);
  assert.deepEqual(new Set(calls),new Set([fantamasterVotesURL(6),FANTAMASTER_PLAYERS_URL,FANTAMASTER_LIVE_URL]));
  for(const response of [()=>new Response('',{status:503}),()=>new Response('x'.repeat(2000001)),()=>new Response('not JSON')])await assert.rejects(collectFantamasterVotes(2026,6,{...options,fetchImpl:async()=>response()}));
});
test('source routing keeps Leghe votes separate and applies FantaMaster only to its listone',async()=>{
  const f=fixture();
  const fm=await collectTeamMatchdayVotes(2026,6,{listSource:'fantamaster',now:f.now,useCache:false,calendarCollector:async()=>f.calendar,fetchImpl:f.fetchImpl});assert.equal(fm.provider,'FantaMaster');
  const html=voteHTML(f.votes);
  for(const listSource of ['leghe',undefined]){const leghe=await collectTeamMatchdayVotes(2026,6,{listSource,now:f.now,useCache:false,fetchImpl:async()=>new Response(html)});assert.equal(leghe.provider,'Redazione Fantacalcio');}
  assert.equal(voteProvider('fantamaster'),'FantaMaster');assert.equal(voteProvider('leghe'),'Redazione Fantacalcio');
});
