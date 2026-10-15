import type { ModelCostDayBreakdown } from '../types.js';
export interface ActivityCell {
    day: string;
    level: 0 | 1 | 2 | 3 | 4;
    future: boolean;
    usage: ModelCostDayBreakdown | undefined;
}
export interface ActivityWeek {
    label: string | undefined;
    cells: ActivityCell[];
}
/** Build Sunday-to-Saturday columns ending in the UTC week containing endDay. */
export declare function buildActivityWeeks(rows: readonly ModelCostDayBreakdown[], endDay: string, weekCount?: number): ActivityWeek[];
