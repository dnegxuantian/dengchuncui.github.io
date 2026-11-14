/** Browser half: per-turn token usage in the finalized assistant footer. */
import { createElement } from 'react';
import { TurnUsage } from './TurnUsage.js';
import { UsageSection } from './UsageSection.js';
import { TYPERT_REMOTE } from '../community/remote.js';
export { displayUsage, formatTokenCount, turnForMessage, usageForMessage } from './turn-usage.js';
export const inject = ['remote'];
function registerUsageUi(ctx, communityAvailable) {
    const communityContext = ctx;
    ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'dsh-usage-turn',
        order: 20,
    }, TurnUsage));
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'usage',
        order: 20,
        label: 'Usage',
    }, (props) => createElement(UsageSection, { ...props, ...(communityAvailable ? { communityContext } : {}) })));
}
/** Register the always-visible turn usage entry. */
export async function apply(ctx) {
    let communityAvailable = true;
    try {
        const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
        ctx.effect(() => disposeRemote, 'dsh-usage.communityRemote');
    }
    catch {
        communityAvailable = false;
    }
    // `$mount()` creates a traced `remote.communityUsage` child service at runtime.
    // Register the UI in a child fiber so Cordis can explicitly inject that dynamic
    // namespace before React callbacks access it.
    await ctx.plugin(Object.assign((scope) => registerUsageUi(scope, communityAvailable), { inject: communityAvailable ? ['slots', 'remote.communityUsage'] : ['slots'] }));
}
