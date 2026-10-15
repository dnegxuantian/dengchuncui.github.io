/** Replay-aware model usage and cost projection for DeepSeek Harness. */
import z from '@deepseek-ai/schemastery';
import { resolveConfig } from './pricing.js';
import { createModelCostProjection } from './projection.js';
import { CommunityUsageService } from './community/service.js';
import { pluginVersion } from './version.js';
export { createModelCostProjection } from './projection.js';
export { formatCost } from './format.js';
export { resolveConfig } from './pricing.js';
export const name = 'usage';
export const inject = ['sessionProjections'];
const rateSchema = z.object({
    provider: z.string().required(),
    model: z.string().required(),
    effectiveFrom: z.string(),
    uncachedInput: z.number().min(0).required(),
    cacheRead: z.number().min(0).required(),
    cacheWrite: z.number().min(0).required(),
    output: z.number().min(0).required(),
});
/** Loader schema for currency and effective-dated exact-model schedules. */
export const Config = z.object({
    currency: z.string().default('USD'),
    rates: z.array(rateSchema).required(),
    communityUrl: z.string().default('https://dshcommunity.com'),
});
/** Register the replay-derived usage and cost projection. */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    ctx.sessionProjections.register(createModelCostProjection(resolved));
    const communityUrl = config.communityUrl?.trim() ?? '';
    void ctx.plugin(CommunityUsageService, {
        baseUrl: communityUrl.replace(/\/+$/u, ''),
        pluginVersion,
        projection: resolved,
    });
}
