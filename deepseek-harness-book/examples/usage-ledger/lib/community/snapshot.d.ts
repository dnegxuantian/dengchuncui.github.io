import type { SessionInspection } from '@deepseek-ai/dsh-session-persistence';
import type { ResolvedModelCostConfig } from '../pricing.js';
import type { CommunitySnapshot } from './protocol.js';
export declare function normalizeCommunityRoute(provider: string, model: string): {
    provider: string;
    model: string;
};
export declare function buildCommunitySnapshot(config: ResolvedModelCostConfig, inspections: readonly SessionInspection[], pluginVersion: string, revision: number): CommunitySnapshot;
