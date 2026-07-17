/**
 * Ordinary least-squares trendline for the e1RM overlay.
 * x = days since the first point, y = e1RM (kg).
 */

export interface TrendModel {
  slope: number;
  intercept: number;
  /** coefficient of determination, 0..1 */
  r2: number;
  predict: (x: number) => number;
}

export function leastSquares(points: Array<{ x: number; y: number }>): TrendModel {
  const n = points.length;
  if (n === 0) {
    return { slope: 0, intercept: 0, r2: 0, predict: () => 0 };
  }
  if (n === 1) {
    const y = points[0].y;
    return { slope: 0, intercept: y, r2: 1, predict: () => y };
  }

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;
  for (const p of points) {
    ssXY += (p.x - meanX) * (p.y - meanY);
    ssXX += (p.x - meanX) ** 2;
    ssYY += (p.y - meanY) ** 2;
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  for (const p of points) {
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
  }
  const r2 = ssYY === 0 ? 1 : Math.max(0, 1 - ssRes / ssYY);

  return { slope, intercept, r2, predict: (x) => slope * x + intercept };
}

/** Days between two ISO dates (yyyy-mm-dd), UTC-safe. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Attach a `trend` value to each dated point so Recharts can draw the
 * overlay from the same data array.
 */
export function withTrend<T extends { date: string; e1rm: number }>(
  series: T[],
): Array<T & { trend: number }> {
  if (series.length === 0) return [];
  const origin = series[0].date;
  const model = leastSquares(
    series.map((p) => ({ x: daysBetween(origin, p.date), y: p.e1rm })),
  );
  return series.map((p) => ({
    ...p,
    trend: Math.round(model.predict(daysBetween(origin, p.date)) * 10) / 10,
  }));
}
