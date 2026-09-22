/** Browser half: per-turn token usage in the finalized assistant footer. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export { displayUsage, formatTokenCount, turnForMessage, usageForMessage } from './turn-usage.js';
export type { TurnUsageDisplay } from './turn-usage.js';
export declare const inject: string[];
/** Register the always-visible turn usage entry. */
export declare function apply(ctx: ClientContext): Promise<void>;
