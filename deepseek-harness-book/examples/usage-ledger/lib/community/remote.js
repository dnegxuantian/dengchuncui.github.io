import { z } from 'zod';
const requestSchema = z.object({}).strict();
const syncRequestSchema = z.object({ enabled: z.boolean() }).strict();
const statusSchema = z.object({
    configured: z.boolean(),
    joined: z.boolean(),
    syncEnabled: z.boolean(),
    identity: z.object({
        githubLogin: z.string(),
        displayName: z.string(),
        avatarUrl: z.url(),
        profileUrl: z.url(),
    }).strict().optional(),
    link: z.object({ verificationUri: z.url(), userCode: z.string(), expiresAt: z.number() }).strict().optional(),
    lastSyncedAt: z.number().optional(),
    lastError: z.string().optional(),
    syncInProgress: z.boolean(),
}).strict();
const resultSchema = z.object({
    ok: z.boolean(),
    value: statusSchema.optional(),
    error: z.string().optional(),
}).strict();
function descriptor(method, parameterSchema) {
    return {
        id: `dsh-usage#communityUsage/${method}`,
        service: 'communityUsage',
        namespace: 'communityUsage',
        method,
        invocation: { kind: 'direct' },
        parameters: [{
                name: 'request',
                wire: 'request',
                source: 'json',
                codec: { mode: 'strict', typeSymbol: `dsh-usage/community#${method}Request`, schema: parameterSchema },
            }],
        result: { mode: 'strict', typeSymbol: 'dsh-usage/community#CommunityResult', schema: resultSchema },
    };
}
export const TYPERT_REMOTE = {
    package: 'dsh-usage',
    descriptors: [
        descriptor('status', requestSchema),
        descriptor('startLink', requestSchema),
        descriptor('pollLink', requestSchema),
        descriptor('setSync', syncRequestSchema),
        descriptor('syncNow', requestSchema),
        descriptor('signOut', requestSchema),
    ],
};
