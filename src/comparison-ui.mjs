import {forecastTotals} from './forecast.mjs';
export const COMPARISON_METHODS=[{id:'deepseek',label:'DeepSeek'},{id:'kimi',label:'Kimi'},{id:'statistical-engine',label:'Statistical engine'}];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const points=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(n);
export function comparisonWinner(items) {
  if(items.length<2||items.some(i=>i.actual_result?.status!=='complete'||i.actual_result.late))return [];
  const rules=JSON.stringify(items[0].record.rules.slice(3,14));
  if(items.some(i=>JSON.stringify(i.record.rules.slice(3,14))!==rules))return [];
  const best=Math.max(...items.map(i=>i.actual_result.total));
  return items.filter(i=>Math.abs(i.actual_result.total-best)<.001).map(i=>i.method);
}
export function renderComparisonCards(items) {
  const winners=comparisonWinner(items);
  return `<div class="comparison-grid">${COMPARISON_METHODS.map(method=>{
    const item=items.find(i=>i.method===method.id);
    if(!item)return `<section class="content-card comparison-card"><h3>${method.label}</h3><p>Nessuna proposta salvata per questa giornata.</p></section>`;
    const record=item.record,rec=record.recommendation,result=item.actual_result,players=new Map(record.players.map(p=>[p.id,p]));
    const late=!record.roundStartsAt||Date.parse(rec.createdAt)>=Date.parse(record.roundStartsAt);
    const playerLabel=id=>{const p=players.get(id);return `${escape(p?.name??id)} <small>${escape(p?.club??'')} · ${escape(p?.role??'')}</small>`;};
    const expected=rec.forecast?forecastTotals(rec.forecast).expected:null;
    return `<section class="content-card comparison-card"><div class="comparison-title"><h3>${method.label}</h3>${winners.includes(method.id)?`<span class="comparison-winner">${winners.length>1?'Pari merito':'Migliore'}</span>`:''}</div>
      <p class="analysis-meta">${escape(rec.lineup.formation)} · salvata ${escape(new Date(rec.createdAt).toLocaleString('it-IT'))}</p>
      ${late?'<p class="analysis-alert">Fuori termine o orario non verificato: esclusa dalla valutazione del metodo.</p>':''}
      <div class="comparison-score"><strong>${result?.status==='complete'?points(result.total):'—'}</strong><span>Fantapunti reali</span></div>
      ${expected!==null?`<p class="analysis-meta">Previsione: ${points(expected)} punti</p>`:''}
      <p>${escape(result?.status==='complete'?`Modificatore difesa: +${points(result.modifier)} · ${result.substitutions.length} sostituzioni · ${result.goals} gol`:result?.reason??'Voti non ancora raccolti.')}</p>
      ${result?.substitutions?.length?`<ul class="comparison-substitutions">${result.substitutions.map(s=>`<li>${escape(players.get(s.out)?.name)} → ${escape(players.get(s.in)?.name)}</li>`).join('')}</ul>`:''}
      <details class="analysis-disclosure"><summary>Formazione e panchina</summary><h4>Titolari scelti</h4><ol class="comparison-players">${rec.lineup.starters.map(id=>{const actual=result?.players?.find(p=>p.starterId===id);return `<li>${playerLabel(id)}${actual?`<span>${actual.rated?`${points(actual.points)}${actual.id!==id?' (subentro)':''}`:'S.V.'}</span>`:''}</li>`;}).join('')}</ol><h4>Panchina, in ordine</h4><ol class="comparison-players">${rec.lineup.bench.map(id=>`<li>${playerLabel(id)}</li>`).join('')}</ol></details>
      <details class="analysis-disclosure"><summary>Proposta e regole salvate</summary><p class="comparison-recommendation">${escape(rec.text)}</p><ul>${record.rules.filter(Boolean).map(rule=>`<li>${escape(rule)}</li>`).join('')}</ul></details>
      ${result?.sourceUrl?`<p class="analysis-meta">${escape(result.provider)} · verificato ${escape(new Date(result.checkedAt).toLocaleString('it-IT'))} · <a href="${escape(result.sourceUrl)}" target="_blank" rel="noopener noreferrer">Voti della giornata ↗</a></p>`:''}</section>`;
  }).join('')}</div>`;
}
let mountedController;
export async function mountComparison(team) {
  mountedController?.abort();const controller=new AbortController();mountedController=controller;
  const host=document.querySelector('#lineup-comparison');if(!host)return;
  let rounds=[],selected=null,items=[],busy=false,error='',notice='';
  const request=async(url,options={})=>{
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
    const data=await response.json();if(!response.ok)throw Error(data.error??'Confronto non disponibile.');return data;
  };
  const render=()=>{
    if(!host.isConnected||controller.signal.aborted)return;
    if(!rounds.length){host.innerHTML=`<section class="content-card"><p role="status">${escape(error|| (busy?'Caricamento proposte salvate…':'Nessuna formazione archiviata. Genera una proposta nella pagina Formazione: sarà salvata automaticamente per metodo e giornata.'))}</p>${error?'<button class="button button-outline" data-comparison-retry>Riprova</button>':''}</section>`;host.querySelector('[data-comparison-retry]')?.addEventListener('click',load);return;}
    const seasons=[...new Set(rounds.map(r=>r.season))],days=rounds.filter(r=>r.season===selected.season);
    const allComplete=items.length>=2&&items.every(i=>i.actual_result?.status==='complete'),winners=comparisonWinner(items);
    host.innerHTML=`<div class="comparison-toolbar"><label>Stagione<select id="comparison-season" ${busy?'disabled':''}>${seasons.map(s=>`<option value="${s}" ${s===selected.season?'selected':''}>${s}/${s+1}</option>`).join('')}</select></label><label>Giornata<select id="comparison-matchday" ${busy?'disabled':''}>${days.map(r=>`<option value="${r.matchday}" ${r.matchday===selected.matchday?'selected':''}>${r.matchday}</option>`).join('')}</select></label><button id="comparison-refresh" class="button button-outline" ${busy?'disabled':''}>${busy?'Aggiornamento…':'Aggiorna risultati'}</button></div>
      <p class="analysis-meta">${items.length}/3 metodi salvati. Voti: Redazione Fantacalcio. Bonus/malus classici, imbattibilità +1 e modificatore secondo le regole salvate. Sostituzioni stesso ruolo, ordine P/D/C/A.</p>
      <p role="status">${escape(error||notice||(busy?'Raccolta dei voti e calcolo dei punteggi…':allComplete&&!winners.length?'Confronto non assegnato: controlla gli orari di generazione e le differenze fra le regole salvate.':'Il migliore viene indicato quando tutti i metodi salvati hanno risultati completi, le stesse regole e proposte generate prima della giornata.'))}</p>
      ${renderComparisonCards(items)}`;
    host.querySelector('#comparison-season').addEventListener('change',e=>{selected=rounds.find(r=>r.season===Number(e.target.value));items=[];loadRound();});
    host.querySelector('#comparison-matchday').addEventListener('change',e=>{selected={season:selected.season,matchday:Number(e.target.value)};items=[];loadRound();});
    host.querySelector('#comparison-refresh').addEventListener('click',refresh);
  };
  const refresh=async()=>{
    busy=true;error='';notice='';render();
    try{const data=await request('/api/lineups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamId:team.id,...selected})});items=data.items;notice=data.notice??'';}
    catch(e){if(controller.signal.aborted)return;error=e.message;}
    finally{busy=false;render();}
  };
  const loadRound=async()=>{
    busy=true;error='';notice='';render();
    try{const params=new URLSearchParams({teamId:team.id,season:selected.season,matchday:selected.matchday});const data=await request(`/api/lineups?${params}`);items=data.items;render();await refresh();}
    catch(e){if(controller.signal.aborted)return;error=e.message;busy=false;render();}
  };
  const load=async()=>{
    busy=true;error='';render();
    try{const data=await request(`/api/lineups?${new URLSearchParams({teamId:team.id})}`);rounds=[...new Map(data.items.map(r=>[`${r.season}:${r.matchday}`,{season:r.season,matchday:r.matchday}])).values()];selected=rounds[0];if(selected)await loadRound();else{busy=false;render();}}
    catch(e){if(controller.signal.aborted)return;error=e.message;busy=false;render();}
  };
  await load();
}
