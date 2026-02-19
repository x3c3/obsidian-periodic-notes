export type Granularity =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"; /*| "fiscal-year" */

export const granularities: Granularity[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year" /*", fiscal-year" */,
];

export interface PeriodicConfig {
  enabled: boolean;
  openAtStartup: boolean;

  format: string;
  folder: string;
  templatePath?: string;
}

export interface DateNavigationItem {
  granularity: Granularity;
  date: import("moment").Moment;
  label: string;
  matchData?: {
    exact: boolean;
    matchType: import("./cache").MatchType;
  };
}

export interface CalendarSet {
  id: string;
  ctime: string;

  day?: PeriodicConfig;
  week?: PeriodicConfig;
  month?: PeriodicConfig;
  quarter?: PeriodicConfig;
  year?: PeriodicConfig;
  fiscalYear?: PeriodicConfig;
}
