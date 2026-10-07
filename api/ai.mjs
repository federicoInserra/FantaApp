import { handleAI } from '../server/ai-proxy.mjs';
export default { fetch: request => handleAI(request) };
