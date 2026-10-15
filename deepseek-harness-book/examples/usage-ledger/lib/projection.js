import { z } from 'zod';
import { bucketsFromUsage, chargeNano, findRate } from './pricing.js';
const bucketsSchema = {
    uncachedInputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
};
const breakdownSchema = z.object({
    ...bucketsSchema,
    requests: z.number().int().nonnegative(),
    unpricedRequests: z.number().int().nonnegative(),
    usageUnavailableRequests: z.number().int().nonnegative(),
    costNano: z.number().int().nonnegative(),
}).strict();
const projectionSchema = breakdownSchema.extend({
    currency: z.string().length(3),
    byModel: z.array(breakdownSchema.extend({ provider: z.string(), model: z.string() }).strict()),
    byPurpose: z.array(breakdownSchema.extend({ purpose: z.enum(['agent', 'compaction']) }).strict()),
    byTurn: z.array(breakdownSchema.extend({ turn: z.number().int().nonnegative() }).strict()),
    byDay: z.array(breakdownSchema.extend({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }).strict()),
}).strict();
const routeSchema = z.object({ provider: z.string(), model: z.string() }).strict();
const stateSchema = z.object({
    currentRoute: routeSchema.optional(),
    openStep: z.object({
        turn: z.number().int(), step: z.number().int(),
        route: routeSchema.optional(), hadUsage: z.boolean(),
    }).strict().optional(),
    lastAgentSample: z.object({
        turn: z.number().int(), step: z.number().int(), route: routeSchema,
        purpose: z.enum(['agent', 'compaction']),
        buckets: z.object(bucketsSchema).strict(),
        costNano: z.number().int().nonnegative(), priced: z.boolean(), day: z.string(),
    }).strict().optional(),
    total: breakdownSchema,
    byModel: z.record(z.string(), breakdownSchema),
    byPurpose: z.object({ agent: breakdownSchema, compaction: breakdownSchema }).strict(),
    byTurn: z.record(z.string(), breakdownSchema),
    byDay: z.record(z.string(), breakdownSchema),
}).strict();
function emptyBreakdown() {
    return {
        requests: 0,
        unpricedRequests: 0,
        usageUnavailableRequests: 0,
        costNano: 0,
        uncachedInputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
    };
}
function routeKey(route) {
    return JSON.stringify([route.provider, route.model]);
}
function checked(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('dsh-usage: projection total exceeds the safe integer range');
    }
    return value;
}
function adjustBreakdown(current, sample, direction) {
    return {
        requests: checked(current.requests + direction),
        unpricedRequests: checked(current.unpricedRequests + direction * (sample.priced ? 0 : 1)),
        usageUnavailableRequests: current.usageUnavailableRequests,
        costNano: checked(current.costNano + direction * sample.costNano),
        uncachedInputTokens: checked(current.uncachedInputTokens + direction * sample.buckets.uncachedInputTokens),
        cacheReadTokens: checked(current.cacheReadTokens + direction * sample.buckets.cacheReadTokens),
        cacheWriteTokens: checked(current.cacheWriteTokens + direction * sample.buckets.cacheWriteTokens),
        outputTokens: checked(current.outputTokens + direction * sample.buckets.outputTokens),
    };
}
function addUsage(state, sample, previous) {
    let total = state.total;
    const byModel = { ...state.byModel };
    const byPurpose = { ...state.byPurpose };
    const byTurn = { ...state.byTurn };
    const byDay = { ...state.byDay };
    if (previous !== undefined) {
        total = adjustBreakdown(total, previous, -1);
        const previousModelKey = routeKey(previous.route);
        byModel[previousModelKey] = adjustBreakdown(byModel[previousModelKey] ?? emptyBreakdown(), previous, -1);
        byPurpose[previous.purpose] = adjustBreakdown(byPurpose[previous.purpose], previous, -1);
        if (previous.purpose === 'agent') {
            const key = String(previous.turn);
            byTurn[key] = adjustBreakdown(byTurn[key] ?? emptyBreakdown(), previous, -1);
        }
        byDay[previous.day] = adjustBreakdown(byDay[previous.day] ?? emptyBreakdown(), previous, -1);
    }
    const modelKey = routeKey(sample.route);
    return {
        ...state,
        total: adjustBreakdown(total, sample, 1),
        byModel: {
            ...byModel,
            [modelKey]: adjustBreakdown(byModel[modelKey] ?? emptyBreakdown(), sample, 1),
        },
        byPurpose: {
            ...byPurpose,
            [sample.purpose]: adjustBreakdown(byPurpose[sample.purpose], sample, 1),
        },
        byTurn: sample.purpose === 'agent'
            ? {
                ...byTurn,
                [String(sample.turn)]: adjustBreakdown(byTurn[String(sample.turn)] ?? emptyBreakdown(), sample, 1),
            }
            : byTurn,
        byDay: {
            ...byDay,
            [sample.day]: adjustBreakdown(byDay[sample.day] ?? emptyBreakdown(), sample, 1),
        },
    };
}
function addUnavailable(state, route, purpose, day, turn) {
    const total = { ...state.total, usageUnavailableRequests: checked(state.total.usageUnavailableRequests + 1) };
    const byPurpose = {
        ...state.byPurpose,
        [purpose]: {
            ...state.byPurpose[purpose],
            usageUnavailableRequests: checked(state.byPurpose[purpose].usageUnavailableRequests + 1),
        },
    };
    const byTurn = purpose === 'agent' && turn !== undefined
        ? {
            ...state.byTurn,
            [String(turn)]: {
                ...(state.byTurn[String(turn)] ?? emptyBreakdown()),
                usageUnavailableRequests: checked((state.byTurn[String(turn)]?.usageUnavailableRequests ?? 0) + 1),
            },
        }
        : state.byTurn;
    const byDay = {
        ...state.byDay,
        [day]: {
            ...(state.byDay[day] ?? emptyBreakdown()),
            usageUnavailableRequests: checked((state.byDay[day]?.usageUnavailableRequests ?? 0) + 1),
        },
    };
    if (route === undefined)
        return { ...state, total, byPurpose, byTurn, byDay };
    const key = routeKey(route);
    const current = state.byModel[key] ?? emptyBreakdown();
    return {
        ...state,
        total,
        byPurpose,
        byTurn,
        byDay,
        byModel: {
            ...state.byModel,
            [key]: { ...current, usageUnavailableRequests: checked(current.usageUnavailableRequests + 1) },
        },
    };
}
function sampleFor(config, route, purpose, usage, time, turn, step) {
    const buckets = bucketsFromUsage(usage);
    const rate = findRate(config, route.provider, route.model, time);
    return {
        turn,
        step,
        route,
        purpose,
        buckets,
        costNano: rate === undefined ? 0 : chargeNano(buckets, rate),
        priced: rate !== undefined,
        day: new Date(time).toISOString().slice(0, 10),
    };
}
function usageOf(event) {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'usage')
        return event.data.chunk.usage;
    if (event.type === 'assistant/message')
        return event.data.usage;
    return undefined;
}
export function applyModelCostEvent(config, state, event) {
    if (event.type === 'request/header') {
        const currentRoute = {
            provider: event.data.header.config.provider,
            model: event.data.header.config.model,
        };
        const openStep = state.openStep === undefined ? undefined : { ...state.openStep, route: currentRoute };
        return { ...state, currentRoute, ...openStep === undefined ? {} : { openStep } };
    }
    if (event.type === 'step/start') {
        return {
            ...state,
            openStep: { ...event.data, ...(state.currentRoute === undefined ? {} : { route: state.currentRoute }), hadUsage: false },
        };
    }
    const usage = usageOf(event);
    if (usage !== undefined && (event.type === 'assistant/chunk' || event.type === 'assistant/message')) {
        const route = state.openStep?.route ?? state.currentRoute;
        if (route === undefined)
            return state;
        const sample = sampleFor(config, route, 'agent', usage, event.time, event.data.turn, event.data.step);
        const previous = state.lastAgentSample?.turn === sample.turn && state.lastAgentSample.step === sample.step
            ? state.lastAgentSample
            : undefined;
        const next = addUsage(state, sample, previous);
        return {
            ...next,
            lastAgentSample: sample,
            ...(next.openStep === undefined ? {} : { openStep: { ...next.openStep, hadUsage: true } }),
        };
    }
    if (event.type === 'step/end') {
        const open = state.openStep;
        const next = open !== undefined && open.turn === event.data.turn && open.step === event.data.step && !open.hadUsage
            ? addUnavailable(state, open.route, 'agent', new Date(event.time).toISOString().slice(0, 10), open.turn)
            : state;
        const { openStep: _closed, ...withoutOpenStep } = next;
        return withoutOpenStep;
    }
    if (event.type === 'compaction/summary') {
        const route = { provider: event.data.provider, model: event.data.model };
        if (event.data.usage === undefined) {
            return addUnavailable(state, route, 'compaction', new Date(event.time).toISOString().slice(0, 10));
        }
        const sample = sampleFor(config, route, 'compaction', event.data.usage, event.time, -1, event.seq);
        return addUsage(state, sample);
    }
    return state;
}
export function viewModelCostState(config, state) {
    const byModel = Object.entries(state.byModel)
        .map(([key, value]) => {
        const parsed = JSON.parse(key);
        return { provider: parsed[0], model: parsed[1], ...value };
    })
        .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
    const byPurpose = ['agent', 'compaction']
        .map(purpose => ({ purpose, ...state.byPurpose[purpose] }));
    const byTurn = Object.entries(state.byTurn)
        .map(([turn, value]) => ({ turn: Number(turn), ...value }))
        .sort((left, right) => left.turn - right.turn);
    const byDay = Object.entries(state.byDay)
        .map(([day, value]) => ({ day, ...value }))
        .sort((left, right) => left.day.localeCompare(right.day));
    return { currency: config.currency, ...state.total, byModel, byPurpose, byTurn, byDay };
}
/** Build the pure model usage/cost projection for one normalized rate table. */
export function createModelCostProjection(config) {
    return {
        key: 'modelCost',
        schema: projectionSchema,
        stateSchema,
        init: () => ({
            total: emptyBreakdown(),
            byModel: {},
            byPurpose: { agent: emptyBreakdown(), compaction: emptyBreakdown() },
            byTurn: {},
            byDay: {},
        }),
        apply: (state, event) => applyModelCostEvent(config, state, event),
        view: state => viewModelCostState(config, state),
        wire: {
            viewSchema: projectionSchema,
            view: state => viewModelCostState(config, state),
        },
        stateVersion: config.stateVersion + 1,
    };
}
/** Fold an immutable event slice without publishing or resuming a Session. */
export function foldModelCostEvents(config, events) {
    const definition = createModelCostProjection(config);
    let state = definition.init();
    for (const event of events)
        state = definition.apply(state, event);
    return definition.view(state);
}
