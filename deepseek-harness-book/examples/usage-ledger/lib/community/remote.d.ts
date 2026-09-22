import type { Context } from '@deepseek-ai/cordis';
import type { RemoteResult, TypertClientRemote, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { CommunityEmptyRequest, CommunityResult, CommunityStatus, CommunitySyncRequest } from './types.js';
interface CommunityRemoteNamespace {
    status(request: CommunityEmptyRequest): Promise<RemoteResult<CommunityResult<CommunityStatus>>>;
    startLink(request: CommunityEmptyRequest): Promise<RemoteResult<CommunityResult<CommunityStatus>>>;
    pollLink(request: CommunityEmptyRequest): Promise<RemoteResult<CommunityResult<CommunityStatus>>>;
    setSync(request: CommunitySyncRequest): Promise<RemoteResult<CommunityResult<CommunityStatus>>>;
    syncNow(request: CommunityEmptyRequest): Promise<RemoteResult<CommunityResult<CommunityStatus>>>;
    signOut(request: CommunityEmptyRequest): Promise<RemoteResult<CommunityResult<CommunityStatus>>>;
}
export interface CommunityClientContext extends Context {
    remote: TypertClientRemote & {
        communityUsage: CommunityRemoteNamespace;
    };
}
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export {};
