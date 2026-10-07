export const ENDPOINT = 'https://api.fireworks.ai/inference/v1/responses';
export async function postJSON(url, key, body, { signal, fetchImpl = fetch, provider = 'Fireworks' } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Connessione a ${provider} non riuscita. Controlla Internet e riprova.`);
  }
  if (!response.ok) {
    const messages = { 401: 'Chiave API non valida.', 403: 'Accesso negato al servizio o al modello.', 402: 'Credito insufficiente.', 429: 'Limite di richieste raggiunto.', 432: 'Limite del piano raggiunto.', 433: 'Limite di spesa raggiunto.' };
    throw new Error(`${provider}: ${messages[response.status] ?? `richiesta non riuscita (HTTP ${response.status}).`} Nessun tentativo automatico.`);
  }
  try { return await response.json(); } catch { throw new Error(`${provider}: risposta non leggibile.`); }
}
export function responseText(data) {
  if (data?.status !== 'completed') throw new Error('Analisi non completata. I risultati parziali non sono stati applicati.');
  const text = (data.output ?? []).filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => item.content ?? []).filter(part => part.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('\n');
  if (!text.trim()) throw new Error('Risposta AI vuota.');
  return text;
}
