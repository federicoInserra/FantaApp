import {formationView} from './analysis-state.mjs';
import {FIELDS,staleReason} from './research.mjs';
import {predictedPoints} from './forecast.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>new Date(value).toLocaleString('it-IT',{timeZone:'Europe/Rome'});
const n=value=>value.toLocaleString('it-IT',{maximumFractionDigits:3});
const statistic=(label,value,provenance)=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd><small>${escape(provenance)}</small></div>`;
export function renderPlayerAnalysis(team,id,{matchday=team.research?.matchday??'',now=Date.now(),fromPitch=false}={}){
  const research=team.research,view=formationView(team,matchday,now);
  const prediction=view.ai?team.recommendation?.forecast?.players.find(p=>p.id===id):null;
  let html='';
  if(fromPitch){
    html+=`<section class="player-insight"><h3>Perché titolare</h3>${prediction?`<p>${escape(prediction.reason)}</p><p class="field-hint">${team.recommendation?.method==='statistical-engine'?'Statistical engine · stima dello slot con copertura':'Valutazione AI'} · ${escape(date(team.recommendation.createdAt))}</p><h3>Previsione individuale</h3><p class="player-prediction"><strong>${n(predictedPoints(prediction))} fp</strong> · stima indicativa</p><p class="field-hint">Voto ${n(prediction.vote)} + bonus ${n(prediction.bonus)} − malus ${n(prediction.malus)}. I modificatori di squadra sono conteggiati nel totale della formazione.</p>`:`<p class="field-hint">${view.ai?'Genera una nuova proposta per vedere il motivo individuale della scelta.':'Il campo mostra una bozza indicativa. Genera una proposta aggiornata per vedere il motivo della scelta.'}</p>`}</section>`;
  }
  if(!research)return html+'<section class="player-insight"><h3>Statistiche</h3><p class="field-hint">Aggiorna i dati per vedere le statistiche di questo giocatore.</p></section>';
  const observations=research.players.find(p=>p.id===id)?.observations??[];
  const understat=research.understat?.players?.find(p=>p.rosterId===id);
  const stats=observations.filter(o=>Object.hasOwn(FIELDS,o.field));
  html+=`<section class="player-insight"><h3>Dati della ricerca</h3><p class="field-hint">Raccolta ${escape(date(research.completedAt??research.createdAt))}. Medie e totali storici, separati dalla previsione.</p>${staleReason(research,team,matchday,now)?'<p class="import-error">Dati da aggiornare prima della prossima analisi.</p>':''}<dl class="player-statistics">${stats.map(o=>statistic(FIELDS[o.field],o.field==='kickoff'?date(o.value):o.value,`${o.period||'Periodo non indicato'} · ${o.kind==='forecast'?'Previsione editoriale · ':''}[${o.sourceId}]`)).join('')}</dl>${!stats.length?'<p class="field-hint">Nessuna statistica Fantacalcio disponibile per questo giocatore.</p>':''}</section>`;
  html+='<section class="player-insight"><h3>Understat</h3>';
  if(understat?.player){
    const p=understat.player,period=`${research.understat.season}/${research.understat.season+1} · [U1]`;
    const fields={minutes:'Minuti',games:'Presenze',npxg:'npxG',xa:'xA',npxgPer90:'npxG / 90',xaPer90:'xA / 90',shots:'Tiri'};
    html+=`<p class="field-hint">${escape(p.name)} · ${escape(p.clubs.join(', '))}. Dati storici, non probabilità di bonus.</p><dl class="player-statistics">${Object.entries(fields).map(([field,label])=>statistic(label,p[field]==null?'Non disponibile':n(p[field]),period)).join('')}</dl>`;
  }else html+='<p class="field-hint">Statistiche Understat non disponibili.</p>';
  if(understat?.reason)html+=`<p class="field-hint">${escape(understat.reason)}</p>`;
  html+='</section>';
  const sourceIds=new Set(stats.map(o=>o.sourceId));
  const sources=(research.sources??[]).filter(source=>sourceIds.has(source.id));
  if(understat?.player&&!sources.some(s=>s.id==='U1'))sources.push({id:'U1',title:'Understat',url:research.understat.sourceUrl});
  if(sources.length)html+=`<details class="player-insight"><summary>Fonti delle statistiche</summary><ul>${sources.map(s=>`<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">[${escape(s.id)}] ${escape(s.title)}</a></li>`).join('')}</ul></details>`;
  return html;
}
