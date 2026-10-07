import { LEGACY_KEY } from './storage.mjs';
import { cloudState, mergeTeams, EMPTY_STATE } from './cloud-state.mjs';
export const CLOUD_KEY='fantaapp.cloud.v1';
export const BACKUP_KEY='fantaapp.before-cloud.v1';
const copy=value=>structuredClone(value);
export class CloudSync {
  constructor({storage,fetchImpl=(...args)=>fetch(...args),onStatus=()=>{},uuid=()=>crypto.randomUUID(),delay=600}) {
    Object.assign(this,{storage,fetchImpl,onStatus,uuid,delay});this.busy=false;this.conflict=false;this.timer=null;
    const raw=storage.getItem(CLOUD_KEY);
    if(raw) {
      this.entry=JSON.parse(raw);cloudState(this.entry.state);
      if(!(this.entry.revision===null || (Number.isSafeInteger(this.entry.revision)&&this.entry.revision>=0)) || typeof this.entry.dirty!=='boolean')throw new Error('Archivio cloud locale non valido.');
    } else {
      const legacy=storage.getItem(LEGACY_KEY);
      const state=legacy?cloudState(JSON.parse(legacy)):copy(EMPTY_STATE);
      this.entry={state,revision:null,dirty:state.teams.length>0,mutationId:this.uuid()};
      if(legacy && !storage.getItem(BACKUP_KEY))storage.setItem(BACKUP_KEY,legacy);
    }
    this.token=raw;this.mode=this.entry.dirty?'pending':'loading';
  }
  get state(){return copy(this.entry.state);}
  report(mode,message=''){this.mode=mode;this.onStatus({mode,message});}
  persist(next) {
    // localStorage operations are synchronous: don't replace another tab's newer draft.
    if(this.storage.getItem(CLOUD_KEY)!==this.token){this.conflict=true;this.report('conflict','Un’altra scheda ha aggiornato questo archivio.');throw new Error('Archivio modificato in un’altra scheda.');}
    const raw=JSON.stringify(next);this.storage.setItem(CLOUD_KEY,raw);this.token=raw;this.entry=next;
  }
  async request(method='GET',payload) {
    const response=await this.fetchImpl('/api/teams',{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000)});
    if(response.redirected || response.headers?.get('content-type')?.includes('text/html'))throw new Error('Accedi con Vercel per sincronizzare.');
    if(response.status===409){const e=new Error('Ci sono modifiche più recenti nel cloud.');e.conflict=true;throw e;}
    if(response.status===503)throw new Error('Database non configurato: verifica DATABASE_URL su Vercel.');
    if(!response.ok)throw new Error('Cloud non disponibile. Le modifiche restano sul dispositivo.');
    const data=await response.json();data.state=cloudState(data.state);
    if(!Number.isSafeInteger(data.revision)||data.revision<0)throw new Error('Risposta cloud non valida.');
    return data;
  }
  async refresh() {
    if(this.busy)return false;
    if(this.entry.dirty && this.entry.revision!==null)return this.flush();
    this.busy=true;this.report('loading');
    try {
      const remote=await this.request();
      if(this.entry.dirty){this.report('import','Squadre locali da importare. Nessun dato cloud è stato sostituito.');return false;}
      const state={...remote.state,activeTeamId:this.entry.state.activeTeamId??remote.state.activeTeamId};
      this.persist({state,revision:remote.revision,dirty:false,mutationId:this.uuid()});this.conflict=false;this.report('saved');return true;
    }catch(error){this.report(this.conflict?'conflict':'offline',error.message);return false;}
    finally{this.busy=false;}
  }
  save(state) {
    const next=cloudState(state);
    const changed=JSON.stringify(next.teams)!==JSON.stringify(this.entry.state.teams);
    if(!changed)return;
    this.persist({...this.entry,state:next,dirty:true,mutationId:this.uuid()});
    this.report(this.conflict?'conflict':this.entry.revision===null?'import':'pending');
    clearTimeout(this.timer);
    if(!this.busy && !this.conflict && this.entry.revision!==null)this.timer=setTimeout(()=>void this.flush(),this.delay);
  }
  async flush() {
    if(this.busy || this.conflict)return false;
    if(!this.entry.dirty)return true;
    if(this.entry.revision===null){this.report('import');return false;}
    clearTimeout(this.timer);this.busy=true;this.report('saving');const sent=copy(this.entry);
    try {
      const remote=await this.request('PUT',{revision:sent.revision,state:sent.state,mutationId:sent.mutationId});
      const unchanged=this.entry.mutationId===sent.mutationId;
      this.persist({...this.entry,revision:remote.revision,dirty:!unchanged});
      this.report(unchanged?'saved':'pending');return true;
    }catch(error){if(error.conflict)this.conflict=true;this.report(this.conflict?'conflict':'offline',error.message);return false;}
    finally{this.busy=false;if(this.mode==='pending')this.timer=setTimeout(()=>void this.flush(),this.delay);}
  }
  async importLocal(incoming=this.state) {
    if(this.busy)return false;
    this.busy=true;this.report('loading');
    try {
      // Read latest before an additive import. Matching teams are skipped; differing ID collisions become copies.
      const remote=await this.request();
      let additions=this.entry.dirty?mergeTeams(this.entry.state,incoming,this.uuid):incoming;
      const shared=this.storage.getItem(CLOUD_KEY);
      if(shared!==this.token && shared) additions=mergeTeams(JSON.parse(shared).state,additions,this.uuid);
      this.token=shared;
      const merged=mergeTeams(remote.state,additions,this.uuid);
      this.persist({state:merged,revision:remote.revision,dirty:true,mutationId:this.uuid()});this.conflict=false;
    }catch(error){this.report(this.conflict?'conflict':'offline',error.message);return false;}
    finally{this.busy=false;}
    return this.flush();
  }
  async useCloud() {
    if(this.busy)return false;
    this.busy=true;
    try {
      const remote=await this.request();
      // Retain a recoverable copy before the user explicitly chooses the cloud version.
      const shared=this.storage.getItem(CLOUD_KEY);
      const recovery=shared?mergeTeams(JSON.parse(shared).state,this.entry.state,this.uuid):this.entry.state;
      this.storage.setItem(BACKUP_KEY,JSON.stringify(recovery));
      this.token=shared;
      this.persist({state:remote.state,revision:remote.revision,dirty:false,mutationId:this.uuid()});this.conflict=false;this.report('saved');return true;
    }catch(error){this.report('offline',error.message);return false;}
    finally{this.busy=false;}
  }
  dispose(){clearTimeout(this.timer);}
}
