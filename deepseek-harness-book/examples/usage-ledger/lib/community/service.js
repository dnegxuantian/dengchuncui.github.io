import { randomUUID } from 'node:crypto';
import { Context, Service } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { buildCommunitySnapshot } from './snapshot.js';
import { communityStateDomainSpec, signedOutCommunityState } from './state.js';
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
function messageOf(error) {
    const message = error instanceof Error ? error.message : 'Community request failed';
    return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
export class CommunityUsageService extends TypertRemoteService {
    static inject = ['storageDomain', 'sessionPersistence', 'sessions'];
    config;
    state;
    timer;
    activeSync;
    constructor(ctx, config) {
        super(ctx, 'communityUsage');
        this.config = config;
    }
    async [Service.init]() {
        const domain = await this.ctx.storageDomain.open(communityStateDomainSpec);
        this.ctx.effect(() => async () => {
            if (this.timer !== undefined)
                clearInterval(this.timer);
            await this.activeSync?.catch(() => undefined);
            await domain.close();
        }, 'dsh-usage.communityDomainClose');
        this.state = domain.global;
        if (this.state.get().installationId === '00000000-0000-4000-8000-000000000000') {
            await this.state.set({ ...this.state.get(), installationId: randomUUID() });
        }
        this.timer = setInterval(() => {
            const state = this.requireState().get();
            if (state.syncEnabled && state.deviceCredential !== undefined)
                void this.runSync();
        }, SYNC_INTERVAL_MS);
        this.timer.unref?.();
    }
    async status(_request) {
        return { ok: true, value: this.publicStatus() };
    }
    async startLink(_request) {
        try {
            const response = await this.request('/api/v1/device-links', {
                method: 'POST',
                body: JSON.stringify({ installationId: this.requireState().get().installationId }),
            });
            await this.replaceState({
                pendingLink: response,
                lastError: undefined,
            });
            return { ok: true, value: this.publicStatus() };
        }
        catch (error) {
            return await this.recordFailure(error);
        }
    }
    async pollLink(_request) {
        const pending = this.requireState().get().pendingLink;
        if (pending === undefined)
            return { ok: true, value: this.publicStatus() };
        try {
            const response = await this.request('/api/v1/device-links/token', {
                method: 'POST',
                body: JSON.stringify({ deviceCode: pending.deviceCode }),
            });
            if (response.status === 'approved' && response.deviceCredential !== undefined && response.identity !== undefined) {
                await this.replaceState({
                    deviceCredential: response.deviceCredential,
                    identity: response.identity,
                    pendingLink: undefined,
                    lastError: undefined,
                });
            }
            else if (response.status === 'expired') {
                await this.replaceState({ pendingLink: undefined, lastError: 'The GitHub connection code expired.' });
            }
            return { ok: true, value: this.publicStatus() };
        }
        catch (error) {
            return await this.recordFailure(error);
        }
    }
    async setSync(request) {
        const current = this.requireState().get();
        if (request.enabled && current.deviceCredential === undefined) {
            return { ok: false, error: 'Connect GitHub before enabling Community Sync.', value: this.publicStatus() };
        }
        await this.replaceState({ syncEnabled: request.enabled, lastError: undefined });
        return request.enabled ? await this.runSync() : { ok: true, value: this.publicStatus() };
    }
    async syncNow(_request) {
        if (!this.requireState().get().syncEnabled) {
            return { ok: false, error: 'Community Sync is turned off.', value: this.publicStatus() };
        }
        return await this.runSync();
    }
    async signOut(_request) {
        const current = this.requireState().get();
        await this.replaceState({ syncEnabled: false, lastError: undefined });
        await this.activeSync?.catch(() => undefined);
        if (current.deviceCredential === undefined) {
            await this.requireState().set(signedOutCommunityState(this.requireState().get()));
            return { ok: true, value: this.publicStatus() };
        }
        try {
            await this.request('/api/v1/device/logout', {
                method: 'POST',
                headers: { authorization: `Bearer ${current.deviceCredential}` },
                body: '{}',
            });
            await this.requireState().set(signedOutCommunityState(this.requireState().get()));
            return { ok: true, value: this.publicStatus() };
        }
        catch (error) {
            return await this.recordFailure(error);
        }
    }
    runSync() {
        if (this.activeSync !== undefined)
            return this.activeSync;
        const operation = this.performSync()
            .finally(() => {
            if (this.activeSync === operation)
                this.activeSync = undefined;
        })
            .then(result => ({ ...result, value: this.publicStatus() }));
        this.activeSync = operation;
        return operation;
    }
    async performSync() {
        const before = this.requireState().get();
        if (before.deviceCredential === undefined) {
            return { ok: false, error: 'GitHub is not connected.', value: this.publicStatus() };
        }
        try {
            let snapshot = before.pendingSnapshot;
            if (snapshot === undefined) {
                const catalog = await this.ctx.sessionPersistence.listSnapshots();
                const sessionIds = new Set(catalog.map(item => item.header.id));
                for (const session of this.ctx.sessions.list())
                    sessionIds.add(session.header.id);
                const inspections = await Promise.all([...sessionIds].map(sessionId => this.ctx.sessionPersistence.inspect(sessionId)));
                snapshot = buildCommunitySnapshot(this.config.projection, inspections, this.config.pluginVersion, before.acceptedRevision + 1);
                await this.replaceState({ pendingSnapshot: snapshot, lastError: undefined });
            }
            await this.request('/api/v1/snapshots', {
                method: 'PUT',
                headers: { authorization: `Bearer ${before.deviceCredential}` },
                body: JSON.stringify(snapshot),
            });
            await this.replaceState({
                acceptedRevision: snapshot.revision,
                lastDigest: snapshot.snapshotDigest,
                pendingSnapshot: undefined,
                lastSyncedAt: Date.now(),
                lastError: undefined,
            });
            return { ok: true, value: this.publicStatus() };
        }
        catch (error) {
            return await this.recordFailure(error);
        }
    }
    publicStatus() {
        const state = this.requireState().get();
        const identity = state.identity === undefined || this.config.baseUrl.length === 0 ? state.identity : {
            ...state.identity,
            profileUrl: new URL(`/u/${encodeURIComponent(state.identity.githubLogin)}`, `${this.config.baseUrl}/`).toString(),
        };
        return {
            configured: this.config.baseUrl.length > 0,
            joined: state.deviceCredential !== undefined,
            syncEnabled: state.syncEnabled,
            ...(identity === undefined ? {} : { identity }),
            ...(state.pendingLink === undefined ? {} : {
                link: {
                    verificationUri: state.pendingLink.verificationUri,
                    userCode: state.pendingLink.userCode,
                    expiresAt: state.pendingLink.expiresAt,
                },
            }),
            ...(state.lastSyncedAt === undefined ? {} : { lastSyncedAt: state.lastSyncedAt }),
            ...(state.lastError === undefined ? {} : { lastError: state.lastError }),
            syncInProgress: this.activeSync !== undefined,
        };
    }
    async request(path, init) {
        if (this.config.baseUrl.length === 0)
            throw new Error('Community URL is not configured.');
        const controller = new AbortController();
        const timeout = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(new URL(path, `${this.config.baseUrl}/`), {
                ...init,
                signal: controller.signal,
                headers: { 'content-type': 'application/json', ...init.headers },
            });
            const payload = await response.json().catch(() => undefined);
            if (!response.ok)
                throw new Error(payload?.error ?? `Community request failed (${String(response.status)}).`);
            return payload;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async recordFailure(error) {
        const message = messageOf(error);
        await this.replaceState({ lastError: message });
        return { ok: false, error: message, value: this.publicStatus() };
    }
    async replaceState(patch) {
        const handle = this.requireState();
        const next = { ...handle.get(), ...patch };
        for (const [key, value] of Object.entries(patch))
            if (value === undefined)
                delete next[key];
        await handle.set(next);
    }
    requireState() {
        if (this.state === undefined)
            throw new Error('dsh-usage: Community state is not initialized');
        return this.state;
    }
}
/** Apply standard Remote markers without shipping decorator syntax to Node. */
function markCommunityRemote(method) {
    const prototype = CommunityUsageService.prototype;
    let initializer;
    const decorate = Remote(method);
    decorate(prototype[method], {
        kind: 'method',
        name: method,
        static: false,
        private: false,
        access: {
            has: (object) => method in object,
            get: (object) => object[method],
        },
        addInitializer: (value) => { initializer = value; },
    });
    if (initializer === undefined)
        throw new Error(`dsh-usage: failed to mark Community Remote method ${method}`);
    initializer.call(Object.create(prototype));
}
for (const method of ['status', 'startLink', 'pollLink', 'setSync', 'syncNow', 'signOut'])
    markCommunityRemote(method);
