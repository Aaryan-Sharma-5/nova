export type TimePoint = { date: string; score: number };

export type AnomalyResult = {
  score: number;
  zScore: number;
  isAnomaly: boolean;
  direction: "spike" | "drop" | "normal";
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

export function detectAnomaly(history: TimePoint[], windowSize: number = 6, threshold: number = 2.0): AnomalyResult {
  if (history.length === 0) {
    return { score: 0, zScore: 0, isAnomaly: false, direction: "normal" };
  }

  const scores = history.map(point => point.score);
  const recent = scores.slice(-windowSize);
  const baseline = scores.slice(0, Math.max(0, scores.length - windowSize));
  const baselineMean = baseline.length ? average(baseline) : average(scores);
  const baselineStd = standardDeviation(baseline.length ? baseline : scores) || 1;
  const recentMean = average(recent);
  const zScore = (recentMean - baselineMean) / baselineStd;

  const isAnomaly = Math.abs(zScore) >= threshold;
  const direction: AnomalyResult["direction"] = isAnomaly
    ? zScore > 0
      ? "spike"
      : "drop"
    : "normal";

  return {
    score: Math.round(recentMean * 100) / 100,
    zScore: Math.round(zScore * 100) / 100,
    isAnomaly,
    direction,
  };
}
