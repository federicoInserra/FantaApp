import {modelInfo} from './ai-models.mjs';

export const BATCH_MODEL = 'all-suggestions';
export const jobModelLabel = model => model === BATCH_MODEL ? 'Statistical engine, DeepSeek e Kimi' : modelInfo(model).label;
