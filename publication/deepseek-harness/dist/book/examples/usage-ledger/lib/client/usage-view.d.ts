import type { ModelCostBreakdown, ModelCostDayBreakdown, ModelCostProjection, ModelCostRouteBreakdown } from '../types.js';
/** The token total displayed by both the footer and the Usage page. */
export declare function totalTokens(value: ModelCostBreakdown): number;
/** Uncached input and cache-write input are the disjoint non-hit input bucket. */
export declare function inputTokens(value: ModelCostBreakdown): number;
/** Share of reported input served from cache; unavailable calls make the aggregate incomplete. */
export declare function cacheHitRate(value: ModelCostBreakdown): number | undefined;
/** Count model operations, including entered calls whose provider returned no usage. */
export declare function modelCalls(value: ModelCostBreakdown): number;
/** A cost is trustworthy only when every operation has usage and every usage sample has a rate. */
export declare function hasCompleteCost(value: ModelCostBreakdown): boolean;
/** Session-level usage joined with the title carried by Harness's global session feed. */
export interface SessionUsageRow {
    id: string;
    title: string;
    usage: ModelCostProjection;
}
/** Page aggregate over one or more replay-derived session projections. */
export interface UsageAggregate extends ModelCostBreakdown {
    currency: string | undefined;
    byModel: ModelCostRouteBreakdown[];
    byDay: ModelCostDayBreakdown[];
}
/** Fold selected sessions into one summary and one provider/model roster. */
export declare function aggregateUsage(rows: readonly SessionUsageRow[]): UsageAggregate;
