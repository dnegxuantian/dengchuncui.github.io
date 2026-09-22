import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export type TurnUsageProps = PropsRuntime<'conversation.chat.assistant-actions'>;
/** Always-visible, whole-turn model token usage inside the assistant action row. */
export declare function TurnUsage({ messageId, useSession, useProjection }: TurnUsageProps): import("react").JSX.Element | null;
