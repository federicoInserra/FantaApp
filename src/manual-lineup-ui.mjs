import {FORMATIONS,ROLES} from './lineup.mjs';
import {changeManualFormation,selectManualPlayer,manualPlayerChoices,manualLineup} from './manual-lineup.mjs';
import {recommendationLabel} from './recommendation-methods.mjs';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderManualFormation(team,draft,{method,busy=false,reason='',notice='',error='',loading=false,loadError=false}={}) {
  const label=recommendationLabel({method}),byId=new Map(team.players.map(p=>[p.id,p])),disabled=busy||loading;
  const slot=(section,role,index)=>{const player=byId.get(draft[section][role][index]);return `<button type="button" class="${section==='starters'?'pitch-player':'manual-bench-slot'}" data-manual-slot data-section="${section}" data-role="${role}" data-index="${index}" aria-label="${section==='starters'?'Titolare':'Riserva'} ${role} ${index+1}: ${escape(player?.name??'scegli giocatore')}" ${disabled?'disabled':''}><span class="${section==='starters'?'pitch-player-icon':'role-badge'}">${role}</span><strong>${escape(player?.name??'Scegli giocatore')}</strong><small>${escape(player?.club??`${ROLES[role]} · ${index+1}`)}</small></button>`;};
  let valid=true;try{manualLineup(draft,team);}catch{valid=false;}
  const count=Object.values(draft.starters).flat().filter(Boolean).length;
  return `<div class="formation-layout manual-formation"><section class="pitch-card"><div class="pitch-card-head"><div><p class="eyebrow">${escape(label)} · SCELTA MANUALE</p><h2>${escape(draft.formation)} <span>· ${count}/11</span></h2></div><span class="demo-tag">${draft.dirty?'NON SALVATA':'MODIFICABILE'}</span></div>
    <p class="field-hint">${method==='chatgpt'?'Copia il prompt, chiedi la formazione nella tua chat e riporta qui titolari e riserve.':'Scegli personalmente modulo, titolari e riserve.'} Tocca una posizione per scegliere un giocatore dello stesso ruolo.</p>
    <div class="pitch" aria-label="Formazione ${escape(label)} modificabile">${['A','C','D','P'].map(role=>`<div class="pitch-line">${draft.starters[role].map((id,i)=>slot('starters',role,i)).join('')}</div>`).join('')}<div class="pitch-center"></div></div>
    <section class="lineup-bench manual-bench" aria-label="Panchina ${escape(label)} modificabile"><h3>Panchina <span>· ordine di ingresso per ruolo</span></h3>${Object.keys(ROLES).map(role=>draft.bench[role].length?`<div class="manual-bench-role"><h4>${ROLES[role]}</h4><ol>${draft.bench[role].map((id,i)=>`<li>${slot('bench',role,i)}</li>`).join('')}</ol></div>`:'').join('')}<p class="field-hint">Le riserve entrano nell’ordine mostrato per ruolo. Le posizioni vuote non vengono salvate. Scegliendo un giocatore già schierato, le due posizioni si scambiano.</p></section></section>
    <aside class="formation-side"><section class="content-card compact"><p class="eyebrow">${escape(label)}</p><h2>La tua formazione</h2><label class="select-label" for="manual-formation-select">Modulo</label><select id="manual-formation-select" ${disabled?'disabled':''}>${Object.keys(FORMATIONS).map(f=>`<option ${draft.formation===f?'selected':''}>${f}</option>`).join('')}</select><p class="field-hint">Cambiando modulo mantieni le scelte: le prime riserve coprono gli eventuali posti aggiunti, i titolari in più passano in panchina.</p>
    <label class="select-label" for="manual-notes">Note sulla scelta (facoltativo)</label><textarea id="manual-notes" rows="4" maxlength="5000" ${disabled?'disabled':''}>${escape(draft.notes)}</textarea>
    ${loading?'<p role="status">Caricamento della formazione salvata…</p>':''}${loadError?'<button class="button button-outline" type="button" id="manual-load-retry">Riprova caricamento</button>':''}
    <p class="field-hint">${escape(reason||(!valid?'Completa i titolari prima di salvare.':'Salva per archiviare questa formazione in Confronto.'))}</p><button id="manual-save" type="button" class="button button-primary full-width" ${disabled||loadError||Boolean(reason)||!valid?'disabled':''}>${busy?'Salvataggio…':`Salva formazione ${escape(label)}`}</button><p class="field-hint">Una nuova scelta ${escape(label)} sostituisce soltanto quella dello stesso metodo e della stessa giornata.</p><p id="manual-status" role="status">${escape(notice)}</p>${error?`<p class="import-error" role="alert">${escape(error)}</p>`:''}</section></aside></div>`;
}
export function mountManualFormation(host,team,initialDraft,options) {
  document.querySelectorAll('.manual-player-dialog').forEach(dialog=>{dialog.close();dialog.remove();});
  let draft=initialDraft,picker=null,query='';
  const changed=()=>{options.notice='';options.error='';options.onChange(draft);};
  const render=()=>{
    host.innerHTML=renderManualFormation(team,draft,options);
    host.querySelector('#manual-formation-select').onchange=e=>{draft=changeManualFormation(draft,team,e.target.value);changed();render();host.querySelector('#manual-formation-select').focus({preventScroll:true});};
    host.querySelector('#manual-notes').oninput=e=>{draft.notes=e.target.value;draft.dirty=true;changed();host.querySelector('.demo-tag').textContent='NON SALVATA';host.querySelector('#manual-status').textContent='';host.querySelector('[role="alert"]')?.remove();};
    host.querySelector('#manual-save').onclick=()=>options.onSave();
    host.querySelector('#manual-load-retry')?.addEventListener('click',options.onRetry);
    host.querySelectorAll('[data-manual-slot]').forEach(button=>button.onclick=()=>openPicker({section:button.dataset.section,role:button.dataset.role,index:Number(button.dataset.index)}));
  };
  const openPicker=position=>{
    picker=position;query='';
    const dialog=document.createElement('dialog');dialog.className='app-dialog manual-player-dialog';dialog.setAttribute('aria-labelledby','manual-player-title');
    dialog.innerHTML=`<button class="dialog-close" type="button" aria-label="Chiudi selezione giocatore">×</button><p class="eyebrow">${ROLES[position.role]}</p><h2 id="manual-player-title">${position.section==='starters'?'Scegli il titolare':'Scegli la riserva'} ${position.index+1}</h2><label for="manual-player-search">Cerca nella tua rosa</label><input id="manual-player-search" type="search" placeholder="Nome o squadra" autocomplete="off"><div id="manual-player-choices"></div><button id="manual-clear-slot" class="button button-outline full-width" type="button">Svuota posizione</button>`;
    document.body.append(dialog);
    const choose=id=>{draft=selectManualPlayer(draft,team,picker,id);changed();dialog.close();render();host.querySelector(`[data-manual-slot][data-section="${picker.section}"][data-role="${picker.role}"][data-index="${picker.index}"]`)?.focus({preventScroll:true});};
    const choices=()=>{
      const list=dialog.querySelector('#manual-player-choices'),normalize=v=>v.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it');
      const matches=manualPlayerChoices(team,draft,picker.role).filter(({player:p})=>normalize(`${p.name} ${p.club}`).includes(normalize(query)));
      list.innerHTML=matches.length?`<ul class="manual-player-list">${matches.map(({player:p,assigned})=>`<li><button type="button" class="player-row" data-manual-player="${escape(p.id)}"><span class="role-badge role-${p.role}">${p.role}</span><span class="player-identity"><strong>${escape(p.name)}</strong><small>${escape(p.club)}${assigned?` · ${escape(assigned)}`:''}</small></span><span aria-hidden="true">+</span></button></li>`).join('')}</ul>`:'<p>Nessun giocatore disponibile per questo ruolo.</p>';
      list.querySelectorAll('[data-manual-player]').forEach(button=>button.onclick=()=>choose(button.dataset.manualPlayer));
    };
    dialog.querySelector('.dialog-close').onclick=()=>dialog.close();
    dialog.querySelector('#manual-clear-slot').onclick=()=>choose(null);
    dialog.querySelector('#manual-player-search').oninput=e=>{query=e.target.value;choices();};
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});choices();dialog.showModal();dialog.querySelector('#manual-player-search').focus();
  };
  render();
}
