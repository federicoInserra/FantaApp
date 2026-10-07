import { handleRequest } from '../worker/understat-worker.mjs';

// Cache only public league data, for five minutes, within a warm function instance.
export function createLeagueCache(now = Date.now) {
  const entries = new Map();
  return {
    async match(request) {
      const entry = entries.get(request.url);
      if (!entry || entry.expires <= now()) { entries.delete(request.url); return undefined; }
      return new Response(entry.body, { status: entry.status, headers: entry.headers });
    },
    async put(request, response) {
      if (entries.size >= 24) entries.delete(entries.keys().next().value);
      entries.set(request.url, { body: await response.text(), status: response.status, headers: [...response.headers], expires: now() + 300000 });
    },
  };
}
const cache = createLeagueCache();
export async function handleVercelUnderstat(request, options = {}) {
  const origin = new URL(request.url).origin;
  const response = await handleRequest(request, { ALLOWED_ORIGINS: origin }, { cache, ...options });
  // Vercel Authentication protects the deployment. Keep responses out of shared/public caches.
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'private, no-store');
  return result;
}
