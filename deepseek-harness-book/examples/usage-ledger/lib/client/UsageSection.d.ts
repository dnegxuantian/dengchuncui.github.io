import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CommunityClientContext } from '../community/remote.js';
export type UsageSectionProps = PropsRuntime<'settings.section'>;
export type CommunityUsageSectionProps = UsageSectionProps & {
    communityContext?: CommunityClientContext;
};
/** Settings page for all-session and per-session model usage. */
export declare function UsageSection({ useSessions, communityContext }: CommunityUsageSectionProps): import("react").JSX.Element;
