import { HOSTED_API } from './deployment.mjs';
export const ENDPOINT = 'https://api.fireworks.ai/inference/v1/responses';
export async function postJSON(url, key, body, { signal, fetchImpl = fetch, provider = 'Fireworks', hosted = HOSTED_API } = {}) {
  let response;
  const action = url === ENDPOINT ? 'fireworks' : url === 'https://api.tavily.com/search' ? 'search' : url === 'https://api.tavily.com/extract' ? 'extract' : null;
  if (hosted && !action) throw new Error('Servizio non supportato.');
  const headers = { 'Content-Type': 'application/json' };
  if (!hosted) headers.Authorization = `Bearer ${key.trim()}`;
  try {
    response = await fetchImpl(hosted ? '/api/ai' : url, { method: 'POST', headers, body: JSON.stringify(hosted ? {action,body} : body), signal, credentials: hosted ? 'same-origin' : 'omit' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Connessione a ${provider} non riuscita. Controlla Internet e riprova.`);
  }
  if (hosted && (response.redirected || response.headers?.get('content-type')?.includes('text/html'))) throw new Error('Sessione scaduta. Riapri l’app e accedi con Vercel.');
  if (!response.ok) {
    if (hosted && response.status === 503) throw new Error('Configura le chiavi nelle variabili ambiente Vercel e ridistribuisci l’app.');
    if (hosted && response.status === 504) throw new Error('Tempo massimo del servizio raggiunto. Nessun tentativo automatico.');
    const messages = { 401: 'Chiave API non valida.', 403: 'Accesso negato al servizio o al modello.', 402: 'Credito insufficiente.', 429: 'Limite di richieste raggiunto.', 432: 'Limite del piano raggiunto.', 433: 'Limite di spesa raggiunto.' };
    throw new Error(`${provider}: ${messages[response.status] ?? `richiesta non riuscita (HTTP ${response.status}).`} Nessun tentativo automatico.`);
  }
  try { return await response.json(); } catch { throw new Error(`${provider}: risposta non leggibile.`); }
}
export function responseText(data) {
  if (data?.status !== 'completed') {
    const reason = data?.incomplete_details?.reason;
    const outputTokens = data?.usage?.output_tokens, reasoningTokens = data?.usage?.output_tokens_details?.reasoning_tokens;
    const validCount = value => Number.isSafeInteger(value) && value >= 0;
    const tokenDetail = reason === 'max_output_tokens' && validCount(outputTokens)
      ? ` Token generati: ${outputTokens.toLocaleString('it-IT')}${validCount(reasoningTokens) && reasoningTokens <= outputTokens ? ` (ragionamento: ${reasoningTokens.toLocaleString('it-IT')})` : ''}.` : '';
    const detail = reason === 'max_output_tokens' ? 'AI ha raggiunto il limite di token della risposta.'
      : reason === 'content_filter' ? 'Il provider ha interrotto la risposta per il filtro dei contenuti.'
      : reason === 'max_tool_calls' ? 'Il provider ha raggiunto il limite di chiamate agli strumenti.'
      : data?.status === 'failed' ? 'Il provider ha segnalato un errore.'
      : 'Il provider ha interrotto la risposta senza indicare il motivo.';
    throw new Error(`Analisi non completata. ${detail}${tokenDetail} I risultati parziali non sono stati applicati.`);
  }
  const text = (data.output ?? []).filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => item.content ?? []).filter(part => part.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('\n');
  if (!text.trim()) throw new Error('Risposta AI vuota.');
  return text;
}

export async function getAIStatus({fetchImpl = fetch, signal} = {}) {
  const response = await fetchImpl('/api/ai-status', {credentials:'same-origin',cache:'no-store',signal});
  if (response.redirected || response.headers?.get('content-type')?.includes('text/html')) throw new Error('Accedi con Vercel per verificare i servizi.');
  if (!response.ok) throw new Error('Verifica dei servizi non riuscita. Riprova.');
  const data = await response.json();
  if (typeof data.fireworks !== 'boolean' || typeof data.tavily !== 'boolean') throw new Error('Stato dei servizi non valido.');
  return {fireworks:data.fireworks,tavily:data.tavily};
}
