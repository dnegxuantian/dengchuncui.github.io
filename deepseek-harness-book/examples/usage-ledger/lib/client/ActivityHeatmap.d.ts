import type { ModelCostDayBreakdown } from '../types.js';
export interface ActivityHeatmapProps {
    rows: readonly ModelCostDayBreakdown[];
    currency: string | undefined;
    /** Injectable UTC date keeps the calendar deterministic in tests. */
    endDay?: string;
}
/** Full-year keyboard-accessible token activity calendar. */
export declare function ActivityHeatmap({ rows, currency, endDay }: ActivityHeatmapProps): import("react").JSX.Element;
