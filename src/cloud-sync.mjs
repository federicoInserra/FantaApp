import { cloudState } from './cloud-state.mjs';
// Only server-confirmed data is kept in memory. No browser persistence or offline queue.
export class DatabaseTeams {
  constructor({fetchImpl=(...args)=>fetch(...args),onStatus=()=>{},uuid=()=>crypto.randomUUID()}={}) {
    Object.assign(this,{fetchImpl,onStatus,uuid});this.ready=false;this.busy=false;this.current=null;
  }
  get state(){return this.current?structuredClone(this.current.state):{teams:[],activeTeamId:null};}
  async request(method='GET',payload) {
    let response;
    try {response=await this.fetchImpl('/api/teams',{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000)});}
    catch {throw new Error('Database non raggiungibile. Controlla la connessione e ricarica le squadre.');}
    if(response.redirected || response.headers?.get('content-type')?.includes('text/html'))throw new Error('Accedi con Vercel per aprire le squadre.');
    if(response.status===409)throw new Error('La squadra è stata modificata da un altro dispositivo. Ricarica le squadre prima di modificarla.');
    if(response.status===503)throw new Error('Database non configurato.');
    if(!response.ok)throw new Error('Operazione database non riuscita. Ricarica le squadre per verificare i dati.');
    const data=await response.json();data.state=cloudState(data.state);
    if(!Number.isSafeInteger(data.revision)||data.revision<0)throw new Error('Risposta database non valida.');
    return data;
  }
  async load() {
    if(this.busy)return false;
    this.busy=true;this.ready=false;this.onStatus({mode:'loading'});
    try {this.current=await this.request();this.ready=true;this.onStatus({mode:'saved'});return true;}
    catch(error){this.current=null;this.onStatus({mode:'error',message:error.message});return false;}
    finally{this.busy=false;}
  }
  async save(state) {
    if(this.busy || !this.ready)throw new Error('Ricarica le squadre dal database prima di modificarle.');
    const next=cloudState(state);
    this.busy=true;this.onStatus({mode:'saving'});
    try {
      this.current=await this.request('PUT',{revision:this.current.revision,state:next,mutationId:this.uuid()});
      this.onStatus({mode:'saved'});return this.state;
    }catch(error){
      // A response may be lost after a commit. Require a fresh DB read before another mutation.
      this.ready=false;this.current=null;this.onStatus({mode:'error',message:error.message});throw error;
    }finally{this.busy=false;}
  }
}
