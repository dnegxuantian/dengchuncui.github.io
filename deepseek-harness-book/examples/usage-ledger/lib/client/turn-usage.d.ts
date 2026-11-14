import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { ModelCostProjection, ModelCostTurnBreakdown } from '../types.js';
/** Display-ready, disjoint per-turn token buckets. */
export interface TurnUsageDisplay {
    turn: number;
    totalTokens: number;
    /** Uncached input plus cache-write input. */
    inputTokens: number;
    /** Provider-reported cache-read input. */
    cacheTokens: number;
    outputTokens: number;
    /** Present only when every model call in the turn has complete usage and pricing. */
    costNano?: number;
    currency?: string;
}
/** Compact a token count without hiding the exact value from the accessible label. */
export declare function formatTokenCount(value: number): string;
/** Resolve the turn addressed by one finalized assistant message. */
export declare function turnForMessage(nodes: ConversationSnapshot['nodes'], messageId: string): number | undefined;
/** Convert the durable whole-log turn projection into the four footer readings. */
export declare function displayUsage(usage: ModelCostTurnBreakdown, currency: string): TurnUsageDisplay;
/** Find one message's durable per-turn usage; undefined means no provider usage was recorded. */
export declare function usageForMessage(nodes: ConversationSnapshot['nodes'], projection: ModelCostProjection | undefined, messageId: string): TurnUsageDisplay | undefined;
