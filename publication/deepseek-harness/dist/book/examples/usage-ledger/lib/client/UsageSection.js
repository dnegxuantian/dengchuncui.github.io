import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { formatCost } from '../format.js';
import { formatTokenCount } from './turn-usage.js';
import { aggregateUsage, cacheHitRate, hasCompleteCost, inputTokens, modelCalls, totalTokens, } from './usage-view.js';
import { ActivityHeatmap } from './ActivityHeatmap.js';
import css from './UsageSection.module.css';
import { CommunitySettings } from './CommunitySettings.js';
function exactTokens(value) {
    return new Intl.NumberFormat('en-US').format(value);
}
function tokenValue(value) {
    return value === 0 ? '0' : formatTokenCount(value);
}
function costValue(value) {
    if (value.currency === undefined || !hasCompleteCost(value))
        return '--';
    return formatCost(value.costNano, value.currency);
}
function DetailRow({ title, subtitle, tokens, cost, }) {
    return (_jsxs("li", { className: css.detailRow, children: [_jsxs("span", { className: css.detailIdentity, children: [_jsx("span", { className: css.detailTitle, children: title }), _jsx("span", { className: css.detailSubtitle, children: subtitle })] }), _jsxs("span", { className: css.detailNumber, title: `${exactTokens(tokens)} tokens`, children: [tokenValue(tokens), _jsx("span", { className: css.unit, children: " tokens" })] }), _jsx("span", { className: css.detailCost, children: cost })] }));
}
/** Settings page for all-session and per-session model usage. */
export function UsageSection({ useSessions, communityContext }) {
    const sessions = useSessions(state => state);
    const [scope, setScope] = useState('all');
    const sessionRows = useMemo(() => sessions.ids.flatMap((id) => {
        const summary = sessions.byId[id];
        const usage = summary?.projectionValues?.modelCost;
        if (summary === undefined || usage === undefined)
            return [];
        // Every session gets an empty projection baseline. Keep the Usage roster
        // focused on sessions that have actually attempted a model operation.
        if (modelCalls(usage) === 0 && totalTokens(usage) === 0)
            return [];
        return [{ id, title: summary.displayTitle, usage }];
    }), [sessions]);
    useEffect(() => {
        if (scope !== 'all' && !sessionRows.some(row => row.id === scope))
            setScope('all');
    }, [scope, sessionRows]);
    const selectedRows = scope === 'all'
        ? sessionRows
        : sessionRows.filter(row => row.id === scope);
    const aggregate = useMemo(() => aggregateUsage(selectedRows), [selectedRows]);
    const selected = scope === 'all' ? undefined : selectedRows[0];
    const calls = modelCalls(aggregate);
    const cost = costValue(aggregate);
    const cacheRate = cacheHitRate(aggregate);
    return (_jsxs("div", { className: css.section, "data-dsh-usage-settings": "", children: [_jsxs("div", { className: css.headingRow, children: [_jsxs("div", { children: [_jsx("h2", { className: css.title, children: "Usage" }), _jsx("p", { className: css.intro, children: "Model tokens and estimated cost derived from session history." })] }), _jsxs("label", { className: css.scopeField, children: [_jsx("span", { className: css.scopeLabel, children: "Scope" }), _jsxs("select", { className: css.select, value: scope, onChange: (event) => { setScope(event.target.value); }, children: [_jsx("option", { value: "all", children: "All sessions" }), sessionRows.map(row => _jsx("option", { value: row.id, children: row.title }, row.id))] })] })] }), selectedRows.length === 0
                ? _jsx("p", { className: css.empty, children: "Usage will appear after a model call reports token data." })
                : (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.usageCard, children: [_jsxs("div", { className: css.summary, "aria-label": "Usage summary", children: [[
                                            ['Total tokens', totalTokens(aggregate)],
                                            ['Input', inputTokens(aggregate)],
                                            ['Cache', aggregate.cacheReadTokens],
                                            ['Output', aggregate.outputTokens],
                                        ].map(([label, value]) => (_jsxs("div", { className: css.stat, title: `${exactTokens(value)} ${label.toLowerCase()}`, children: [_jsx("span", { className: css.statLabel, children: label }), _jsx("strong", { className: css.statValue, children: tokenValue(value) })] }, label))), _jsxs("div", { className: css.stat, title: `${exactTokens(calls)} model calls`, children: [_jsx("span", { className: css.statLabel, children: "Calls" }), _jsx("strong", { className: css.statValue, children: exactTokens(calls) })] }), _jsxs("div", { className: css.stat, title: cost === '--' ? 'Cost unavailable: missing usage or pricing' : cost, children: [_jsx("span", { className: css.statLabel, children: "Estimated cost" }), _jsx("strong", { className: `${css.statValue} ${css.costValue}`, children: cost })] })] }), _jsxs("p", { className: css.cacheNote, "aria-label": "Input cache hit rate", children: ["\u8F93\u5165\u7F13\u5B58\u547D\u4E2D\u7387\uFF1A", _jsx("strong", { children: cacheRate === undefined ? '--' : `${(cacheRate * 100).toFixed(1)}%` }), _jsx("span", { children: "\u7F13\u5B58\u8BFB\u53D6 / \u5168\u90E8\u8F93\u5165\uFF1B\u4E0D\u8BA1\u8F93\u51FA Token\u3002\u7F3A\u5C11\u8C03\u7528\u7528\u91CF\u65F6\u4E0D\u663E\u793A\u6BD4\u4F8B\u3002" })] }), cost === '--' && calls > 0
                                    ? _jsx("p", { className: css.note, children: "Cost requires complete provider usage and a matching price for every call." })
                                    : null, _jsx(ActivityHeatmap, { rows: aggregate.byDay, currency: aggregate.currency })] }), _jsxs("section", { className: css.group, "aria-labelledby": "dsh-usage-models", children: [_jsx("h3", { className: css.groupTitle, id: "dsh-usage-models", children: "By model" }), _jsxs("div", { className: css.columnHead, "aria-hidden": true, children: [_jsx("span", { children: "Model" }), _jsx("span", { children: "Tokens" }), _jsx("span", { children: "Cost" })] }), _jsx("ul", { className: css.details, children: aggregate.byModel.map(model => (_jsx(DetailRow, { title: model.model, subtitle: `${model.provider} · ${exactTokens(modelCalls(model))} calls`, tokens: totalTokens(model), cost: costValue({ ...model, currency: aggregate.currency }) }, `${model.provider}/${model.model}`))) })] }), _jsxs("section", { className: css.group, "aria-labelledby": "dsh-usage-detail", children: [_jsx("h3", { className: css.groupTitle, id: "dsh-usage-detail", children: selected === undefined ? 'By session' : 'By turn' }), _jsxs("div", { className: css.columnHead, "aria-hidden": true, children: [_jsx("span", { children: selected === undefined ? 'Session' : 'Turn' }), _jsx("span", { children: "Tokens" }), _jsx("span", { children: "Cost" })] }), _jsx("ul", { className: css.details, children: selected === undefined
                                        ? sessionRows.map(row => (_jsx(DetailRow, { title: row.title, subtitle: `${exactTokens(modelCalls(row.usage))} calls · ${row.id}`, tokens: totalTokens(row.usage), cost: costValue(row.usage) }, row.id)))
                                        : [...selected.usage.byTurn].reverse().map(turn => (_jsx(DetailRow, { title: `Turn ${turn.turn}`, subtitle: `Input ${tokenValue(inputTokens(turn))} · Cache ${tokenValue(turn.cacheReadTokens)} · Output ${tokenValue(turn.outputTokens)}`, tokens: totalTokens(turn), cost: costValue({ ...turn, currency: selected.usage.currency }) }, turn.turn))) })] })] })), communityContext === undefined
                ? _jsx("p", { className: css.note, children: "Community controls are unavailable in this Harness build. Local Usage is unaffected." })
                : _jsx(CommunitySettings, { ctx: communityContext })] }));
}
