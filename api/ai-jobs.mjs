import {waitUntil} from '@vercel/functions';
import {handleAIJobs} from '../server/ai-jobs.mjs';
export default {fetch:request=>handleAIJobs(request,{waitUntil})};
