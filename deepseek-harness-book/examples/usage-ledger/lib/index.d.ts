/** Replay-aware model usage and cost projection for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ModelCostConfig } from './types.js';
export type * from './types.js';
export { createModelCostProjection } from './projection.js';
export { formatCost } from './format.js';
export { resolveConfig } from './pricing.js';
export declare const name = "usage";
export declare const inject: string[];
/** Loader schema for currency and effective-dated exact-model schedules. */
export declare const Config: z<ModelCostConfig>;
/** Register the replay-derived usage and cost projection. */
export declare function apply(ctx: Context, config: ModelCostConfig): void;
