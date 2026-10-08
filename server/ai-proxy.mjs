// Access control is provided by Vercel Authentication: keep All Deployments enabled.
// Origin checks prevent browser cross-site calls; they are not authentication.
const FIREWORKS = 'https://api.fireworks.ai/inference/v1/responses';
const MODELS = ['accounts/fireworks/models/deepseek-v4p1-flash', 'accounts/fireworks/models/glm-5p3-flash'];
const URLS = ['https://www.legaseriea.it/serie-a/calendario-risultati', 'https://www.fantacalcio.it/probabili-formazioni-serie-a', 'https://www.fantacalcio.it/statistiche-serie-a'];
const DOMAINS = ['fantacalcio.it', 'sosfanta.com', 'sport.sky.it'];
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const validKey = value => typeof value === 'string' && Boolean(value.trim()) && !/\s/.test(value.trim());
const string = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
async function limitedText(stream, limit) {
  const reader = stream?.getReader();
  if (!reader) throw new Error('body');
  const parts = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length; if (size > limit) throw new Error('size');
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function providerRequest(action, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('payload');
  if (action === 'fireworks') {
    const allowed = ['model','store','max_output_tokens','instructions','input','reasoning','text'];
    const maxOutputTokens = body.model === MODELS[0] ? 36000 : 6000;
    if (Object.keys(body).some(k => !allowed.includes(k)) || !MODELS.includes(body.model) || !string(body.instructions, 20000) || !string(body.input, 450000) || body.store !== false || !Number.isInteger(body.max_output_tokens) || body.max_output_tokens < 1 || body.max_output_tokens > maxOutputTokens) throw new Error('payload');
    // Reconstruct the request: callers cannot enable tools, storage, streaming or arbitrary models.
    const result = {model:body.model, instructions:body.instructions, input:body.input, store:false, max_output_tokens:body.max_output_tokens};
    if (body.model === MODELS[1]) Object.assign(result, {reasoning:{effort:'low'},text:{format:{type:'json_object'}}});
    return {url:FIREWORKS, keyName:'FIREWORKS_API_KEY', body:result};
  }
  if (action === 'search') {
    if (!string(body.query, 1500) || !Array.isArray(body.include_domains) || !body.include_domains.length || body.include_domains.length > 3 || body.include_domains.some(d => !DOMAINS.includes(d))) throw new Error('payload');
    return {url:'https://api.tavily.com/search', keyName:'TAVILY_API_KEY', body:{query:body.query,include_domains:body.include_domains,search_depth:'basic',max_results:2,include_raw_content:true,include_answer:false,include_usage:true,auto_parameters:false}};
  }
  if (action === 'extract') {
    if (!Array.isArray(body.urls) || !body.urls.length || body.urls.length > 3 || body.urls.some(url => !URLS.includes(url))) throw new Error('payload');
    return {url:'https://api.tavily.com/extract',keyName:'TAVILY_API_KEY',body:{urls:[...new Set(body.urls)],extract_depth:'basic',include_usage:true}};
  }
  throw new Error('action');
}
export async function handleAI(request, { env = process.env, fetchImpl = fetch, timeoutMs = 170000 } = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/api/ai-status') {
    if (request.method !== 'GET') return json({error:'method'},405);
    return json({fireworks:validKey(env.FIREWORKS_API_KEY),tavily:validKey(env.TAVILY_API_KEY)});
  }
  if (url.pathname !== '/api/ai') return json({error:'not_found'},404);
  if (request.method !== 'POST') return json({error:'method'},405);
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'origin'},403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'content_type'},415);
  let target;
  try {
    const envelope = JSON.parse(await limitedText(request.body, 512000));
    target = providerRequest(envelope.action, envelope.body);
  } catch (error) { return json({error:'invalid_request'}, error.message === 'size' ? 413 : 400); }
  const key = env[target.keyName]?.trim();
  if (!validKey(key)) return json({error:'not_configured'},503);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    const response = await fetchImpl(target.url, {method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(target.body),signal,redirect:'error'});
    if (!response.ok) return json({error:'provider_error'}, [401,402,403,429,432,433].includes(response.status) ? response.status : 502);
    let content = await limitedText(response.body, 4000000);
    // Never forward credentials, including accidental provider echoes.
    for (const secret of [env.FIREWORKS_API_KEY,env.TAVILY_API_KEY]) if (validKey(secret)) content = content.replaceAll(secret.trim(), '[redacted]');
    return json(JSON.parse(content));
  } catch (error) { return json({error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'provider_unavailable'}, error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 502); }
}
