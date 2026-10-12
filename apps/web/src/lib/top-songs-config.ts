/**
 * Shared by the `/api/top-songs` function and the client cache, so the two
 * sides agree on what a chart is and how long it may be reused. Kept free of
 * any app or DOM import because the function imports this exact file.
 */

/** The charts that come from the database (the "Novas" list does not). */
export const CHART_PERIODS = ["week", "all"] as const
export type ChartPeriod = (typeof CHART_PERIODS)[number]

export function isChartPeriod(value: unknown): value is ChartPeriod {
  return CHART_PERIODS.includes(value as ChartPeriod)
}

/** Each chart is the top 20. */
export const CHART_SIZE = 20

/**
 * How long a chart is reused — at the edge, and then again in the browser —
 * before it is fetched again. The all-time chart has thousands of plays per
 * song and barely moves in minutes, so it can rest longer; the weekly one is
 * short enough to follow what people are listening to.
 */
export const CHART_MAX_AGE_MS: Record<ChartPeriod, number> = {
  week: 30_000,
  all: 5 * 60_000,
}
