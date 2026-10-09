import { neon } from '@neondatabase/serverless';
import { cloudState, EMPTY_STATE } from '../src/cloud-state.mjs';
import {archiveCandidates} from './lineup-history.mjs';
let connection, store;
export function createTeamStore(sql) {
  let ready;
  async function init() {
    if (!ready) ready=(async()=>{
      await sql`CREATE TABLE IF NOT EXISTS fantaapp_workspace (id integer PRIMARY KEY CHECK (id = 1), revision integer NOT NULL DEFAULT 0, state jsonb NOT NULL, mutation_id text, updated_at timestamptz NOT NULL DEFAULT now())`;
      await sql`INSERT INTO fantaapp_workspace (id,state) VALUES (1,${JSON.stringify(EMPTY_STATE)}::jsonb) ON CONFLICT (id) DO NOTHING`;
      await sql`CREATE TABLE IF NOT EXISTS fantaapp_lineup_history (team_id text NOT NULL, season integer NOT NULL, matchday integer NOT NULL, method text NOT NULL, recommendation_id text NOT NULL, record jsonb NOT NULL, actual_result jsonb, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(team_id,season,matchday,method))`;
      // Migrate the latest compatible recommendation once; older choices cannot be recovered.
      const current=await sql`SELECT state FROM fantaapp_workspace WHERE id=1`;
      const candidates=archiveCandidates(cloudState(current[0].state));
      await sql`INSERT INTO fantaapp_lineup_history(team_id,season,matchday,method,recommendation_id,record)
        SELECT x->>'teamId',(x->>'season')::integer,(x->>'matchday')::integer,x->>'method',x->>'recommendationId',x->'record'
        FROM jsonb_array_elements(${JSON.stringify(candidates)}::jsonb) x
        WHERE EXISTS(SELECT 1 FROM fantaapp_workspace w,jsonb_array_elements(w.state->'teams') t WHERE t->>'id'=x->>'teamId' AND t->'recommendation'->>'id'=x->>'recommendationId') ON CONFLICT DO NOTHING`;
    })().catch(error=>{ready=undefined;throw error;});
    await ready;
  }
  const decode=row=>({revision:row.revision,state:cloudState(row.state),mutationId:row.mutation_id??null,updatedAt:row.updated_at});
  return {
    async read() { await init(); const rows=await sql`SELECT revision,state,mutation_id,updated_at FROM fantaapp_workspace WHERE id=1`; return decode(rows[0]); },
    async write({revision,state,mutationId}) {
      await init();
      const candidates=archiveCandidates(state);
      // Workspace and archive are one statement: either both commit or neither does.
      const rows=await sql`WITH previous AS MATERIALIZED (
        SELECT state FROM fantaapp_workspace WHERE id=1 AND revision=${revision} FOR UPDATE
      ), updated AS (
        UPDATE fantaapp_workspace SET state=${JSON.stringify(state)}::jsonb,revision=revision+1,mutation_id=${mutationId},updated_at=now()
        WHERE id=1 AND revision=${revision} AND EXISTS(SELECT 1 FROM previous) RETURNING revision,state,mutation_id,updated_at
      ), archived AS (
        INSERT INTO fantaapp_lineup_history(team_id,season,matchday,method,recommendation_id,record)
        SELECT x->>'teamId',(x->>'season')::integer,(x->>'matchday')::integer,x->>'method',x->>'recommendationId',x->'record'
        FROM jsonb_array_elements(${JSON.stringify(candidates)}::jsonb) x CROSS JOIN previous CROSS JOIN updated
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(previous.state->'teams') t WHERE t->>'id'=x->>'teamId' AND t->'recommendation'->>'id'=x->>'recommendationId'
          AND t->'research'->'understat'->>'season'=x->>'season' AND t->'recommendation'->>'matchday'=x->'record'->'recommendation'->>'matchday')
        ON CONFLICT(team_id,season,matchday,method) DO UPDATE SET recommendation_id=EXCLUDED.recommendation_id,record=EXCLUDED.record,
          actual_result=CASE WHEN fantaapp_lineup_history.recommendation_id=EXCLUDED.recommendation_id THEN fantaapp_lineup_history.actual_result ELSE NULL END,updated_at=now()
      ), removed AS (
        DELETE FROM fantaapp_lineup_history WHERE EXISTS(SELECT 1 FROM updated) AND team_id NOT IN(SELECT t->>'id' FROM updated,jsonb_array_elements(updated.state->'teams') t)
      ) SELECT * FROM updated`;
      if (rows.length) return decode(rows[0]);
      // A retry after a lost response is safe only if that mutation is still the latest.
      const current=await this.read();
      return current.mutationId===mutationId && JSON.stringify(current.state)===JSON.stringify(state) ? current : null;
    },
    async history(teamId,season,matchday) {
      await init();
      if(season!==undefined)return sql`SELECT method,recommendation_id,record,actual_result,updated_at FROM fantaapp_lineup_history WHERE team_id=${teamId} AND season=${season} AND matchday=${matchday} ORDER BY method`;
      return sql`SELECT season,matchday,method,recommendation_id,record->'recommendation'->>'createdAt' AS created_at,actual_result->>'status' AS status,actual_result->'total' AS total FROM fantaapp_lineup_history WHERE team_id=${teamId} ORDER BY season DESC,matchday DESC,method`;
    },
    async score(teamId,season,matchday,method,recommendationId,result) {
      await init();
      const rows=await sql`UPDATE fantaapp_lineup_history SET actual_result=${JSON.stringify(result)}::jsonb WHERE team_id=${teamId} AND season=${season} AND matchday=${matchday} AND method=${method} AND recommendation_id=${recommendationId}
        AND (actual_result IS NULL OR actual_result->>'checkedAt'<=${result.checkedAt}) RETURNING recommendation_id`;
      return rows.length>0;
    }
  };
}
export function databaseURL(env) {
  // Vercel integrations can namespace the generated variables with DB_.
  const names=['DATABASE_URL','POSTGRES_URL','DB_DATABASE_URL','DB_POSTGRES_URL',
    'DATABASE_URL_UNPOOLED','POSTGRES_URL_NON_POOLING','DB_DATABASE_URL_UNPOOLED','DB_POSTGRES_URL_NON_POOLING'];
  return names.map(name=>env[name]).find(value=>typeof value==='string' && value.trim())?.trim() || null;
}
export function databaseStore(env=process.env) {
  const url=databaseURL(env);
  if (!url) return null;
  if (connection!==url) {store=createTeamStore((strings,...values)=>neon(url,{fetchOptions:{signal:AbortSignal.timeout(15000)}})(strings,...values));connection=url;}
  return store;
}
