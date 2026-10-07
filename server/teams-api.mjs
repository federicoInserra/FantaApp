import { databaseStore } from './team-store.mjs';
import { cloudState } from '../src/cloud-state.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
// Vercel Authentication / All Deployments protects this single-user workspace.
export async function handleTeams(request,{store,env=process.env}={}) {
  if (!['GET','PUT'].includes(request.method)) return json({error:'method'},405);
  if (request.method==='PUT' && (request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site')) return json({error:'origin'},403);
  let payload;
  if (request.method==='PUT') {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'content_type'},415);
    try {
      const reader=request.body.getReader(); const chunks=[];let size=0;
      try { while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000)throw new Error('size');chunks.push(Buffer.from(value));} }
      finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Number.isSafeInteger(payload.revision) || payload.revision<0 || typeof payload.mutationId!=='string' || !/^[a-zA-Z0-9-]{10,100}$/.test(payload.mutationId)) throw new Error('payload');
      payload.state=cloudState(payload.state);
    } catch(error) {return json({error:'invalid_state'},error.message==='size'?413:400);}
  }
  try {
    const database=store??databaseStore(env);
    if (!database) return json({error:'not_configured'},503);
    if(request.method==='GET')return json(await database.read());
    const result=await database.write(payload);
    return result?json(result):json({error:'conflict'},409);
  } catch {return json({error:'database_unavailable'},502);}
}
