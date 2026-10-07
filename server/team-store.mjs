import { neon } from '@neondatabase/serverless';
import { cloudState, EMPTY_STATE } from '../src/cloud-state.mjs';
let connection, store;
export function createTeamStore(sql) {
  let ready;
  async function init() {
    if (!ready) ready=(async()=>{
      await sql`CREATE TABLE IF NOT EXISTS fantaapp_workspace (id integer PRIMARY KEY CHECK (id = 1), revision integer NOT NULL DEFAULT 0, state jsonb NOT NULL, mutation_id text, updated_at timestamptz NOT NULL DEFAULT now())`;
      await sql`INSERT INTO fantaapp_workspace (id,state) VALUES (1,${JSON.stringify(EMPTY_STATE)}::jsonb) ON CONFLICT (id) DO NOTHING`;
    })().catch(error=>{ready=undefined;throw error;});
    await ready;
  }
  const decode=row=>({revision:row.revision,state:cloudState(row.state),mutationId:row.mutation_id??null,updatedAt:row.updated_at});
  return {
    async read() { await init(); const rows=await sql`SELECT revision,state,mutation_id,updated_at FROM fantaapp_workspace WHERE id=1`; return decode(rows[0]); },
    async write({revision,state,mutationId}) {
      await init();
      const rows=await sql`UPDATE fantaapp_workspace SET state=${JSON.stringify(state)}::jsonb,revision=revision+1,mutation_id=${mutationId},updated_at=now() WHERE id=1 AND revision=${revision} RETURNING revision,state,mutation_id,updated_at`;
      if (rows.length) return decode(rows[0]);
      // A retry after a lost response is safe only if that mutation is still the latest.
      const current=await this.read();
      return current.mutationId===mutationId && JSON.stringify(current.state)===JSON.stringify(state) ? current : null;
    }
  };
}
export function databaseStore(env=process.env) {
  const url=env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) return null;
  if (connection!==url) {store=createTeamStore((strings,...values)=>neon(url,{fetchOptions:{signal:AbortSignal.timeout(15000)}})(strings,...values));connection=url;}
  return store;
}
