import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { formatCost } from '../format.js';
import { formatTokenCount, usageForMessage } from './turn-usage.js';
import css from './TurnUsage.module.css';
/** Always-visible, whole-turn model token usage inside the assistant action row. */
export function TurnUsage({ messageId, useSession, useProjection }) {
    const nodes = useSession(snapshot => snapshot.nodes);
    const projection = useProjection('modelCost');
    const usage = useMemo(() => usageForMessage(nodes, projection, messageId), [messageId, nodes, projection]);
    if (usage === undefined)
        return null;
    const total = formatTokenCount(usage.totalTokens);
    const input = formatTokenCount(usage.inputTokens);
    const cache = formatTokenCount(usage.cacheTokens);
    const output = formatTokenCount(usage.outputTokens);
    const cost = usage.costNano === undefined || usage.currency === undefined
        ? undefined
        : formatCost(usage.costNano, usage.currency);
    const detail = `Token usage for this turn: ${usage.totalTokens.toLocaleString()} total; `
        + `${usage.inputTokens.toLocaleString()} input; ${usage.cacheTokens.toLocaleString()} cache; `
        + `${usage.outputTokens.toLocaleString()} output`
        + (cost === undefined ? '' : `; estimated cost ${cost}`);
    return (_jsxs("span", { className: css.root, "data-dsh-usage-turn": "", "data-turn": usage.turn, "aria-label": detail, title: detail, children: [_jsxs("span", { className: css.metric, children: ["Total ", total, " tokens"] }), _jsx("span", { className: css.separator, "aria-hidden": true, children: "\u00B7" }), _jsxs("span", { className: css.metric, children: ["Input ", input] }), _jsx("span", { className: css.separator, "aria-hidden": true, children: "\u00B7" }), _jsxs("span", { className: css.metric, children: ["Cache ", cache] }), _jsxs("span", { className: `${css.metric} ${css.output}`, children: [_jsx("span", { className: css.separator, "aria-hidden": true, children: "\u00B7" }), "\u00A0Output ", output] }), cost === undefined ? null : (_jsxs("span", { className: `${css.metric} ${css.cost}`, children: [_jsx("span", { className: css.separator, "aria-hidden": true, children: "\u00B7" }), "\u00A0Cost ", cost] }))] }));
}
