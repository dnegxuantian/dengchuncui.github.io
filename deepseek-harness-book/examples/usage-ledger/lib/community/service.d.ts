import { Context, Service } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ResolvedModelCostConfig } from '../pricing.js';
import type { CommunityEmptyRequest, CommunityResult, CommunityStatus, CommunitySyncRequest } from './types.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        communityUsage: CommunityUsageService;
    }
}
export interface CommunityUsageServiceConfig {
    baseUrl: string;
    pluginVersion: string;
    projection: ResolvedModelCostConfig;
}
export declare class CommunityUsageService extends TypertRemoteService {
    static inject: string[];
    private readonly config;
    private state?;
    private timer?;
    private activeSync;
    constructor(ctx: Context, config: CommunityUsageServiceConfig);
    protected [Service.init](): Promise<void>;
    status(_request: CommunityEmptyRequest): Promise<CommunityResult<CommunityStatus>>;
    startLink(_request: CommunityEmptyRequest): Promise<CommunityResult<CommunityStatus>>;
    pollLink(_request: CommunityEmptyRequest): Promise<CommunityResult<CommunityStatus>>;
    setSync(request: CommunitySyncRequest): Promise<CommunityResult<CommunityStatus>>;
    syncNow(_request: CommunityEmptyRequest): Promise<CommunityResult<CommunityStatus>>;
    signOut(_request: CommunityEmptyRequest): Promise<CommunityResult<CommunityStatus>>;
    private runSync;
    private performSync;
    private publicStatus;
    private request;
    private recordFailure;
    private replaceState;
    private requireState;
}
