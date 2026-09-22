import { z } from 'zod';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import type { ResolvedModelCostConfig } from './pricing.js';
import type { ModelCostBreakdown, ModelCostProjection, ModelCostPurposeBreakdown, ModelCostTokenBuckets } from './types.js';
type Purpose = ModelCostPurposeBreakdown['purpose'];
interface Route {
    provider: string;
    model: string;
}
interface MutableBreakdown extends ModelCostBreakdown {
}
interface UsageSample {
    turn: number;
    step: number;
    route: Route;
    purpose: Purpose;
    buckets: ModelCostTokenBuckets;
    costNano: number;
    priced: boolean;
    day: string;
}
interface OpenStep {
    turn: number;
    step: number;
    route?: Route | undefined;
    hadUsage: boolean;
}
/** Plain-JSON fold state persisted by the session-projection cache. */
export interface ModelCostState {
    currentRoute?: Route | undefined;
    openStep?: OpenStep | undefined;
    lastAgentSample?: UsageSample | undefined;
    total: MutableBreakdown;
    byModel: Record<string, MutableBreakdown>;
    byPurpose: Record<Purpose, MutableBreakdown>;
    byTurn: Record<string, MutableBreakdown>;
    byDay: Record<string, MutableBreakdown>;
}
type ModelCostDefinition = ProjectionDefinition<'modelCost', ModelCostState> & {
    stateSchema: z.ZodType<ModelCostState>;
    wire: {
        viewSchema: z.ZodType<ModelCostProjection>;
        view(state: ModelCostState): ModelCostProjection;
    };
};
export declare function applyModelCostEvent(config: ResolvedModelCostConfig, state: ModelCostState, event: SessionEvent): ModelCostState;
export declare function viewModelCostState(config: ResolvedModelCostConfig, state: ModelCostState): ModelCostProjection;
/** Build the pure model usage/cost projection for one normalized rate table. */
export declare function createModelCostProjection(config: ResolvedModelCostConfig): ModelCostDefinition;
/** Fold an immutable event slice without publishing or resuming a Session. */
export declare function foldModelCostEvents(config: ResolvedModelCostConfig, events: readonly SessionEvent[]): ModelCostProjection;
export {};
