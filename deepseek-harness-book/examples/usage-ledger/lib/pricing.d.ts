import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ModelCostConfig, ModelCostTokenBuckets, ModelRateConfig } from './types.js';
/** Validated price schedule used by the replay fold. */
export interface ResolvedModelRate extends Required<ModelRateConfig> {
    effectiveFromMs: number;
}
/** Detached, normalized plugin configuration. */
export interface ResolvedModelCostConfig {
    currency: string;
    rates: readonly ResolvedModelRate[];
    stateVersion: number;
}
/** Convert provider usage into the Harness four-bucket accounting vocabulary. */
export declare function bucketsFromUsage(usage: TokenUsage): ModelCostTokenBuckets;
/** Calculate a bucketed charge in billionths of the configured currency unit. */
export declare function chargeNano(buckets: ModelCostTokenBuckets, rate: ResolvedModelRate): number;
/** Resolve the latest exact route schedule effective at an event timestamp. */
export declare function findRate(config: ResolvedModelCostConfig, provider: string, model: string, time: number): ResolvedModelRate | undefined;
/** Validate human-owned schedules and derive projection-cache invalidation. */
export declare function resolveConfig(config: ModelCostConfig): ResolvedModelCostConfig;
