import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { formatCost } from '../format.js';
import { buildActivityWeeks } from './activity-heatmap.js';
import { formatTokenCount } from './turn-usage.js';
import { hasCompleteCost, inputTokens, totalTokens } from './usage-view.js';
import css from './ActivityHeatmap.module.css';
function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}
function dayLabel(day) {
    return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
}
function accessibleDetail(row, day, currency) {
    if (row === undefined)
        return `${dayLabel(day)}: no model usage`;
    const cost = currency !== undefined && hasCompleteCost(row) ? formatCost(row.costNano, currency) : '--';
    return `${dayLabel(day)}: ${totalTokens(row).toLocaleString()} total tokens; `
        + `${inputTokens(row).toLocaleString()} input; ${row.cacheReadTokens.toLocaleString()} cache; `
        + `${row.outputTokens.toLocaleString()} output; cost ${cost}`;
}
/** Full-year keyboard-accessible token activity calendar. */
export function ActivityHeatmap({ rows, currency, endDay = todayUtc() }) {
    const weeks = useMemo(() => buildActivityWeeks(rows, endDay), [endDay, rows]);
    const available = weeks.flatMap(week => week.cells).filter(cell => !cell.future);
    const latestActive = [...available].reverse().find(cell => cell.usage !== undefined);
    const [selectedDay, setSelectedDay] = useState();
    const calendar = useRef(null);
    const selected = available.find(cell => cell.day === selectedDay) ?? latestActive ?? available.at(-1);
    const selectedUsage = selected?.usage;
    const selectedCost = selectedUsage !== undefined && currency !== undefined && hasCompleteCost(selectedUsage)
        ? formatCost(selectedUsage.costNano, currency)
        : '--';
    const moveFocus = (event, day) => {
        const delta = event.key === 'ArrowLeft' ? -7
            : event.key === 'ArrowRight' ? 7
                : event.key === 'ArrowUp' ? -1
                    : event.key === 'ArrowDown' ? 1
                        : 0;
        if (delta === 0)
            return;
        const index = available.findIndex(cell => cell.day === day);
        const target = available[index + delta];
        if (target === undefined)
            return;
        event.preventDefault();
        setSelectedDay(target.day);
        calendar.current?.querySelector(`button[data-day="${target.day}"]`)?.focus();
    };
    return (_jsxs("section", { className: css.activity, "aria-labelledby": "dsh-usage-activity", children: [_jsxs("div", { className: css.activityHead, children: [_jsxs("div", { children: [_jsx("h3", { className: css.title, id: "dsh-usage-activity", children: "Activity" }), _jsx("p", { className: css.caption, children: "Last 52 weeks \u00B7 UTC" })] }), _jsxs("div", { className: css.legend, "aria-label": "Token intensity: less to more", children: [_jsx("span", { children: "Less" }), [0, 1, 2, 3, 4].map(level => _jsx("i", { "data-level": level }, level)), _jsx("span", { children: "More" })] })] }), _jsxs("div", { className: css.selected, "aria-live": "polite", children: [_jsx("strong", { children: selected === undefined ? 'No activity' : dayLabel(selected.day) }), selectedUsage === undefined
                        ? _jsx("span", { children: "No model usage" })
                        : (_jsxs("span", { children: [formatTokenCount(totalTokens(selectedUsage)), " tokens", ' · ', "Input ", formatTokenCount(inputTokens(selectedUsage)), ' · ', "Cache ", formatTokenCount(selectedUsage.cacheReadTokens), ' · ', "Output ", formatTokenCount(selectedUsage.outputTokens), ' · ', "Cost ", selectedCost] }))] }), _jsxs("div", { className: css.calendar, children: [_jsxs("div", { className: css.weekdays, "aria-hidden": true, children: [_jsx("span", {}), _jsx("span", { children: "Mon" }), _jsx("span", {}), _jsx("span", { children: "Wed" }), _jsx("span", {}), _jsx("span", { children: "Fri" }), _jsx("span", {})] }), _jsx("div", { className: css.weeks, ref: calendar, children: weeks.map((week, index) => (_jsxs("div", { className: css.week, children: [_jsx("span", { className: css.month, "aria-hidden": true, children: week.label ?? '' }), week.cells.map(cell => cell.future
                                    ? _jsx("span", { className: css.future, "aria-hidden": true }, cell.day)
                                    : (_jsx("button", { type: "button", className: css.cell, "data-level": cell.level, "data-day": cell.day, "aria-label": accessibleDetail(cell.usage, cell.day, currency), "aria-pressed": selected?.day === cell.day, tabIndex: selected?.day === cell.day ? 0 : -1, title: accessibleDetail(cell.usage, cell.day, currency), onClick: () => { setSelectedDay(cell.day); }, onMouseEnter: () => { setSelectedDay(cell.day); }, onFocus: () => { setSelectedDay(cell.day); }, onKeyDown: (event) => { moveFocus(event, cell.day); } }, cell.day)))] }, week.cells[0]?.day ?? index))) })] })] }));
}
