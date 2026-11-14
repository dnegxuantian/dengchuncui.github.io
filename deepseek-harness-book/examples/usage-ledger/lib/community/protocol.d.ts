import { z } from 'zod';
export declare const COMMUNITY_PROTOCOL_VERSION: 1;
export declare const COMMUNITY_TAXONOMY_VERSION: 1;
export declare const communityBucketsSchema: z.ZodObject<{
    requests: z.ZodNumber;
    usageUnavailableRequests: z.ZodNumber;
    uncachedInputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
}, z.core.$strict>;
export type CommunityBuckets = z.infer<typeof communityBucketsSchema>;
export declare const communityDaySchema: z.ZodObject<{
    requests: z.ZodNumber;
    usageUnavailableRequests: z.ZodNumber;
    uncachedInputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    day: z.ZodString;
}, z.core.$strict>;
export declare const communityModelSchema: z.ZodObject<{
    requests: z.ZodNumber;
    usageUnavailableRequests: z.ZodNumber;
    uncachedInputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    provider: z.ZodString;
    model: z.ZodString;
}, z.core.$strict>;
export interface CommunitySnapshotBody {
    protocolVersion: typeof COMMUNITY_PROTOCOL_VERSION;
    taxonomyVersion: typeof COMMUNITY_TAXONOMY_VERSION;
    pluginVersion: string;
    revision: number;
    dailyUsage: z.infer<typeof communityDaySchema>[];
    modelUsage: z.infer<typeof communityModelSchema>[];
}
export interface CommunitySnapshot extends CommunitySnapshotBody {
    snapshotDigest: string;
}
export declare function canonicalSnapshotBody(body: CommunitySnapshotBody): string;
export declare function digestSnapshotBody(body: CommunitySnapshotBody): string;
export declare function sealSnapshot(body: CommunitySnapshotBody): CommunitySnapshot;
