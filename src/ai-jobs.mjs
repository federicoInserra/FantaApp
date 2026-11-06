import {AI_MODELS} from './ai-models.mjs';
const STORAGE='fantaapp.ai-job.';
export function elapsedLabel(startedAt,now=Date.now()) {
  const seconds=Math.max(0,Math.floor((now-Date.parse(startedAt))/1000));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
// Only a request identifier is kept locally, so a lost start response can be checked
// safely. Prompts, credentials, rosters and results remain in the server database.
export class AIJobs {
  constructor({fetchImpl=(...args)=>fetch(...args),storage,uuid=()=>crypto.randomUUID(),onChange=()=>{},visible=()=>globalThis.document?.visibilityState!=='hidden',schedule=(fn,ms)=>setTimeout(fn,ms)}={}) {
    Object.assign(this,{fetchImpl,uuid,onChange,visible,schedule});try{this.storage=storage??globalThis.localStorage;}catch{this.storage=null;}this.entries=new Map();
  }
  remember(teamId,id){try{if(id)this.storage?.setItem(STORAGE+teamId,id);else this.storage?.removeItem(STORAGE+teamId);}catch{/* Active jobs are also discoverable from the server. */}}
  remembered(teamId){try{return this.storage?.getItem(STORAGE+teamId)??null;}catch{return null;}}
  async request(method,teamId,id,body) {
    const url=method==='POST'?'/api/ai-jobs':`/api/ai-jobs?teamId=${encodeURIComponent(teamId)}${id?`&id=${encodeURIComponent(id)}`:''}`;
    const response=await this.fetchImpl(url,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    if(response.redirected||response.headers?.get('content-type')?.includes('text/html'))throw Error('Sessione scaduta. Riapri l’app e accedi con Vercel.');
    if(!response.ok){const error=Error(response.status===409?'I dati o la squadra sono cambiati. Ricarica la squadra prima di riprovare.':response.status===503?'Servizio AI o database non configurato.':'Verifica dell’analisi non riuscita. Riproveremo a controllare, senza inviare altre richieste AI.');error.status=response.status;throw error;}
    const data=await response.json(),job=data.job;
    if(job&&(!['running','completed','failed'].includes(job.status)||job.teamId!==teamId||typeof job.id!=='string'||!AI_MODELS.some(m=>m.id===job.model)||!Number.isFinite(Date.parse(job.startedAt))||!Number.isFinite(Date.parse(job.expiresAt))))throw Error('Stato dell’analisi non valido.');
    return job;
  }
  publish(entry,job){entry.job=job;entry.error='';this.onChange(entry);}
  tick(entry){
    if(entry.timer||!entry.tracking)return;
    entry.timer=this.schedule(async()=>{entry.timer=null;await this.check(entry.teamId);if(entry.tracking)this.tick(entry);},3000);
  }
  async check(teamId){
    const entry=this.entries.get(teamId);if(!entry||entry.starting||!this.visible())return;
    if(entry.checkPromise)return entry.checkPromise;
    entry.checking=true;
    entry.checkPromise=this.performCheck(entry).finally(()=>{entry.checking=false;entry.checkPromise=null;});
    return entry.checkPromise;
  }
  async performCheck(entry){
    const teamId=entry.teamId;
    try {
      let job=await this.request('GET',teamId,entry.id);
      if(!job&&entry.id)job=await this.request('GET',teamId,null);
      if(job){entry.id=job.id;this.remember(teamId,job.id);
        if(job.status!=='running'){entry.tracking=false;entry.id=null;this.remember(teamId,null);}
        this.publish(entry,job);
      }else{
        entry.tracking=false;this.remember(teamId,null);this.publish(entry,null);
      }
    }catch(error){entry.error=error.message;this.onChange(entry);}
  }
  async resume(teamId){
    let entry=this.entries.get(teamId);
    if(!entry){entry={teamId,id:this.remembered(teamId),tracking:true,checking:false,job:null,error:''};this.entries.set(teamId,entry);}
    if(entry.starting)return entry;
    // Discover work started on another device too; terminal tasks are only looked up
    // by their saved ID, never repeatedly loaded as the latest team task.
    if(!entry.tracking){entry.tracking=true;entry.job=null;}
    await this.check(teamId);this.tick(entry);return entry;
  }
  async start({teamId,model,matchday,researchId,teamFingerprint}){
    // Check any existing task first, including a start whose response was lost.
    let entry=await this.resume(teamId);
    if(entry.tracking&&(entry.starting||entry.checking||entry.job?.status==='running'||entry.error))return entry;
    const id=entry.id??this.uuid();entry={teamId,id,tracking:true,checking:true,job:null,error:'',starting:true};this.entries.set(teamId,entry);this.remember(teamId,id);this.onChange(entry);
    try{const job=await this.request('POST',teamId,id,{id,teamId,model,matchday,researchId,teamFingerprint});entry.starting=false;entry.id=job.id;this.remember(teamId,job.id);if(job.status!=='running'){entry.tracking=false;entry.id=null;this.remember(teamId,null);}this.publish(entry,job);}
    catch(error){entry.error=error.message;if([400,403,404,409,413,415,503].includes(error.status)){entry.tracking=false;this.remember(teamId,null);}this.onChange(entry);}
    finally{entry.starting=false;entry.checking=false;this.tick(entry);}
    return entry;
  }
  async wake(){for(const entry of this.entries.values())if(entry.tracking){await this.check(entry.teamId);this.tick(entry);}}
}
export function jobProgress(job,now=Date.now()) {
  const elapsed=elapsedLabel(job.startedAt,now);
  return `<div class="ai-job-progress"><span class="ai-job-spinner" aria-hidden="true"></span><span>Tempo trascorso <strong id="ai-job-timer">${elapsed}</strong></span><progress aria-label="Generazione della formazione in corso"></progress><p>Puoi bloccare il telefono o chiudere l’app. La proposta verrà salvata automaticamente; torna qui per vederla.</p></div>`;
}
