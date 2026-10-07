import { handleVercelUnderstat } from '../server/vercel-understat.mjs';
export default { fetch(request) { return handleVercelUnderstat(request); } };
