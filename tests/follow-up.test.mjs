import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {buildFollowUpRequest,askFollowUp,followUpUnavailableReason,renderFollowUp} from '../src/follow-up.mjs';
import {analysisFingerprint,storedRecommendation,MAX_FOLLOW_UPS} from '../src/analysis-state.mjs';
import {providerRequest} from '../server/ai-proxy.mjs';
import {players,lineup,forecastFor} from './fixtures/lineup.mjs';
const now=new Date('2026-10-08T12:00:00.000Z');
function context(){
 const team={id:'one',name:'Squadra',listSource:'leghe',formation:'4-3-3',players:structuredClone(players)};
 team.research={id:'research-one',createdAt:now.toISOString(),matchday:'6',understat:{provider:'Understat',season:2026},players:players.map(p=>({id:p.id,observations:[],missing:['starting']})),warnings:['Campione piccolo'],sources:[{id:'F1',title:'Statistiche',url:'https://www.fantacalcio.it/statistiche-serie-a'}]};
 team.recommendation={version:2,id:'rec-one',createdAt:now.toISOString(),researchAt:now.toISOString(),researchId:team.research.id,matchday:'6',teamFingerprint:analysisFingerprint(team),text:'La proposta originale e i suoi ballottaggi [F1].',lineup:structuredClone(lineup),forecast:forecastFor(lineup),sources:team.research.sources,followUps:[{id:'q-one',createdAt:now.toISOString(),question:'Perché questo attaccante?',answer:'Per il suo impiego previsto [F1].'}]};
 return team;
}
test('follow-up sends the original proposal, forecast, rules, research and conversation through the existing proxy contract',()=>{
 const team=context(),before=structuredClone(team);
 const request=buildFollowUpRequest({team,question:'  E il centrocampista?  ',now});
 const input=JSON.parse(request.input);
 assert.equal(input.domanda,'E il centrocampista?');
 assert.equal(input.propostaOriginale.testo,team.recommendation.text);
 assert.deepEqual(input.propostaOriginale.formazione,lineup);
 assert.deepEqual(input.propostaOriginale.previsione,team.recommendation.forecast);
 assert.deepEqual(input.conversazione,[{domanda:team.recommendation.followUps[0].question,risposta:team.recommendation.followUps[0].answer}]);
 assert.equal(input.rosa.length,players.length);assert.match(input.regolamento,/5 sostituzioni/);
 assert.deepEqual(input.raccolta.understat,team.research.understat);assert.deepEqual(input.raccolta.limiti,['Campione piccolo']);
 assert.equal(input.giornata,'6');assert.equal(request.store,false);assert.equal(request.tools,undefined);
 assert.equal(providerRequest('fireworks',request).body.input,request.input);
 assert.deepEqual(team,before);
});
test('changed squad, rules, research, matchday or missing recommendation reject before any provider call',async()=>{
 const mutations=[t=>delete t.recommendation,t=>delete t.research,t=>t.research.id='different',t=>t.players[0].available=false,t=>t.rules=['Changed']];
 for(const mutate of mutations){const team=context();mutate(team);assert.ok(followUpUnavailableReason(team));await assert.rejects(askFollowUp({key:'key',team,question:'Perché?',fetchImpl:()=>{throw Error('Unexpected network call');}}),/proposta/);}
 assert.throws(()=>buildFollowUpRequest({team:context(),question:'Perché?',matchday:'7'}),/giornata/);
 for(const question of ['', ' ', 'x'.repeat(2001),null])assert.throws(()=>buildFollowUpRequest({team:context(),question}),/2.000/);
});
test('an old but matching snapshot can be discussed without pretending to refresh it; manual module choices do not replace the saved proposal',()=>{
 const team=context();team.formation='3-5-2';
 const input=JSON.parse(buildFollowUpRequest({team,question:'Perché?',now:new Date('2026-10-10T12:00:00.000Z')}).input);
 assert.equal(input.propostaOriginale.formazione.formation,'4-3-3');
 assert.equal(input.raccolta.data,now.toISOString());assert.notEqual(input.dataRichiesta,input.raccolta.data);
 const legacy=context();legacy.recommendation.version=1;delete legacy.recommendation.lineup;delete legacy.recommendation.forecast;
 assert.equal(JSON.parse(buildFollowUpRequest({team:legacy,question:'Perché?'}).input).propostaOriginale.formazione,null);
});
test('completed answers contain only visible assistant output; failures and cancellation do not mutate the proposal',async()=>{
 const team=context(),before=structuredClone(team);
 const answer=await askFollowUp({key:'secret',team,question:'Perché?',fetchImpl:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer secret');assert.ok(!options.body.includes('secret'));
  return {ok:true,json:async()=>({status:'completed',output:[{type:'reasoning',content:[{type:'reasoning_text',text:'Hidden'}]},{type:'message',role:'assistant',content:[{type:'output_text',text:'  Motivo documentato [F1].  '}]}]})};
 }});
 assert.equal(answer,'Motivo documentato [F1].');assert.deepEqual(team,before);
 for(const data of [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}},{status:'completed',output:[]},{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'x'.repeat(8001)}]}]}]){
  await assert.rejects(askFollowUp({key:'key',team,question:'Perché?',fetchImpl:async()=>({ok:true,json:async()=>data})}));
 }
 const controller=new AbortController();controller.abort();
 await assert.rejects(askFollowUp({key:'key',team,question:'Perché?',signal:controller.signal,fetchImpl:async()=>{throw controller.signal.reason;}}));
 assert.deepEqual(team,before);
});
test('conversation storage rejects oversized, blank and duplicate entries and removes unrelated properties',()=>{
 const team=context();team.recommendation.followUps[0].apiKey='secret';
 assert.ok(!JSON.stringify(storedRecommendation(team.recommendation)).includes('secret'));
 for(const change of [r=>r.followUps[0].question=' ',r=>r.followUps[0].answer='x'.repeat(8001),r=>r.followUps[0].createdAt='bad',r=>r.followUps.push({...r.followUps[0]}),r=>r.followUps=Array.from({length:MAX_FOLLOW_UPS+1},(_,i)=>({...r.followUps[0],id:String(i)}))]){const rec=structuredClone(team.recommendation);change(rec);assert.throws(()=>storedRecommendation(rec));}
});
test('question UI escapes provider text and draft, displays history, and disables stale or busy requests',()=>{
 const team=context();team.recommendation.followUps[0].question='<img src=x onerror=alert(1)>';team.recommendation.followUps[0].answer='<script>alert(1)</script>';
 const draft='</textarea><script>bad()</script>';
 const $=load(renderFollowUp(team,{draft}));
 assert.equal($('script,img').length,0);assert.equal($('#follow-up-question').text(),draft);
 assert.equal($('.follow-up-history li').length,1);assert.equal($('#follow-up-send').attr('disabled'),undefined);
 assert.equal($('#follow-up-question').attr('maxlength'),'2000');
 for(const options of [{pending:true},{ready:false},{matchday:'7'}]){const view=load(renderFollowUp(team,{draft:'Perché?',...options}));assert.notEqual(view('#follow-up-send').attr('disabled'),undefined);assert.notEqual(view('#follow-up-question').attr('disabled'),undefined);}
 assert.notEqual(load(renderFollowUp(team))('#follow-up-send').attr('disabled'),undefined);
 assert.equal(renderFollowUp({...team,recommendation:null}),'');
 const failed=load(renderFollowUp(team,{draft:'Domanda conservata',error:'<script>Errore</script>'}));
 assert.equal(failed('script').length,0);assert.equal(failed('[role="alert"]').text(),'<script>Errore</script>');assert.equal(failed('textarea').text(),'Domanda conservata');
 assert.equal(load(renderFollowUp(team,{pending:true,asking:true}))('#follow-up-cancel').length,1);
 assert.equal(load(renderFollowUp(team,{pending:true,asking:true,saving:true}))('#follow-up-cancel').length,0);
});
