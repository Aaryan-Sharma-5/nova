export function calculateBurnoutRisk(
  workHoursPerWeek: number,
  sentimentScore: number,
  performanceDecline: number, // 0-1, higher means more decline
  absenceRate: number // 0-1
): number {
  const workHoursNormalized = Math.max(0, Math.min(1, (workHoursPerWeek - 35) / 25));
  const sentimentInverted = (1 - sentimentScore) / 2; // Convert -1..1 to 0..1

  const risk = (
    0.3 * workHoursNormalized +
    0.25 * sentimentInverted +
    0.25 * performanceDecline +
    0.2 * absenceRate
  ) * 100;

  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function calculateAttritionRisk(
  sentimentScore: number,
  engagementScore: number, // 0-100
  tenure: number, // months
  performanceStagnation: number // 0-1
): number {
  const sentimentInverted = (1 - sentimentScore) / 2;
  const engagementInverted = 1 - engagementScore / 100;
  // Higher risk for very new (<6mo) or long tenure (>36mo) employees
  const tenureRisk = tenure < 6 ? 0.7 : tenure > 36 ? 0.5 : 0.2;

  const risk = (
    0.35 * sentimentInverted +
    0.25 * engagementInverted +
    0.2 * tenureRisk +
    0.2 * performanceStagnation
  ) * 100;

  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function generateInterventions(
  burnoutRisk: number,
  attritionRisk: number,
  workHours: number,
  sentimentScore: number,
  engagementScore: number,
  options?: {
    recentBurnoutChange?: number; // positive means rising risk
    recentSentimentChange?: number; // negative means declining sentiment
    upcomingDeadlineWeeks?: number; // 0 for immediate crunch
  },
): string[] {
  const interventions: string[] = [];
  const recentBurnoutChange = options?.recentBurnoutChange ?? 0;
  const recentSentimentChange = options?.recentSentimentChange ?? 0;
  const upcomingDeadlineWeeks = options?.upcomingDeadlineWeeks ?? 0;

  const timingWindow = upcomingDeadlineWeeks <= 1 ? "within 7 days" : "within 2 weeks";

  if (burnoutRisk > 60 || recentBurnoutChange > 10) {
    if (workHours > 45) {
      interventions.push(`Reduce weekly workload by 15-20% ${timingWindow}`);
    }
    interventions.push(`Schedule immediate 1-on-1 with direct manager ${timingWindow}`);
    if (sentimentScore < -0.3 || recentSentimentChange < -0.2) {
      interventions.push("Offer wellness support and EAP resources");
    }
  } else if (burnoutRisk > 30) {
    interventions.push("Monitor workload in next sprint cycle");
    if (workHours > 42) interventions.push("Consider flexible work arrangement");
  }

  if (attritionRisk > 60 || (recentSentimentChange < -0.2 && engagementScore < 55)) {
    interventions.push("Initiate stay interview within 1 week");
    if (engagementScore < 50) interventions.push("Create targeted growth plan with coaching");
    interventions.push("Review compensation against market benchmarks");
  } else if (attritionRisk > 30) {
    interventions.push("Include in next mentorship cohort");
    interventions.push("Discuss growth path in next performance review");
  }

  if (sentimentScore < -0.5) {
    interventions.push("Conduct confidential wellbeing check-in");
  }

  return interventions.length > 0
    ? interventions
    : ["Continue current engagement plan — no immediate action needed"];
}

type CompositeRiskInputs = {
  workHoursPerWeek: number;
  projectLoad: number;
  engagementScore: number;
  sentimentHistory: { score: number }[];
  performanceHistory: { score: number }[];
};

export type CompositeRiskBreakdown = {
  score: number;
  components: {
    sentimentTrend: number;
    workloadIndex: number;
    behavioralChange: number;
    engagementRisk: number;
  };
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

function trendDelta(history: { score: number }[], recentWindow: number, baselineWindow: number): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-recentWindow).map(point => point.score);
  const baseline = history.slice(-baselineWindow, -recentWindow).map(point => point.score);
  const recentAvg = average(recent);
  const baselineAvg = baseline.length > 0 ? average(baseline) : recentAvg;
  return recentAvg - baselineAvg;
}

export function calculateCompositeRisk(inputs: CompositeRiskInputs): CompositeRiskBreakdown {
  const sentimentTrendDelta = trendDelta(inputs.sentimentHistory, 3, 9);
  const sentimentTrend = clamp((Math.abs(sentimentTrendDelta) + 0.2) / 1.2);

  const workloadIndexRaw = (inputs.workHoursPerWeek - 35) / 20;
  const projectIndex = clamp((inputs.projectLoad - 1) / 5);
  const workloadIndex = clamp((workloadIndexRaw + projectIndex) / 2);

  const performanceDelta = trendDelta(inputs.performanceHistory, 3, 9);
  const behavioralChange = clamp(Math.abs(performanceDelta) / 20);

  const engagementRisk = clamp(1 - inputs.engagementScore / 100);

  const score = clamp(
    0.35 * sentimentTrend +
      0.25 * workloadIndex +
      0.2 * behavioralChange +
      0.2 * engagementRisk,
  );

  return {
    score: Math.round(score * 100),
    components: {
      sentimentTrend: Math.round(sentimentTrend * 100),
      workloadIndex: Math.round(workloadIndex * 100),
      behavioralChange: Math.round(behavioralChange * 100),
      engagementRisk: Math.round(engagementRisk * 100),
    },
  };
}

export function getContributingFactors(employee: {
  workHoursPerWeek: number;
  sentimentScore: number;
  absenceDays: number;
  engagementScore: number;
  tenure: number;
  performanceHistory: { score: number }[];
}): { factor: string; impact: 'high' | 'medium' | 'low'; detail: string }[] {
  const factors: { factor: string; impact: 'high' | 'medium' | 'low'; detail: string }[] = [];

  if (employee.workHoursPerWeek > 45) {
    factors.push({ factor: 'High Work Hours', impact: 'high', detail: `${employee.workHoursPerWeek}hrs/week exceeds healthy threshold of 45hrs` });
  } else if (employee.workHoursPerWeek > 42) {
    factors.push({ factor: 'Elevated Work Hours', impact: 'medium', detail: `${employee.workHoursPerWeek}hrs/week is above team average` });
  }

  if (employee.sentimentScore < -0.3) {
    factors.push({ factor: 'Negative Sentiment', impact: 'high', detail: `Sentiment score of ${employee.sentimentScore.toFixed(2)} indicates dissatisfaction` });
  } else if (employee.sentimentScore < 0) {
    factors.push({ factor: 'Declining Sentiment', impact: 'medium', detail: `Sentiment trending below neutral at ${employee.sentimentScore.toFixed(2)}` });
  }

  if (employee.absenceDays > 8) {
    factors.push({ factor: 'Frequent Absences', impact: 'high', detail: `${employee.absenceDays} absence days this quarter` });
  }

  if (employee.engagementScore < 40) {
    factors.push({ factor: 'Low Engagement', impact: 'high', detail: `Engagement score of ${employee.engagementScore}/100` });
  } else if (employee.engagementScore < 60) {
    factors.push({ factor: 'Below Average Engagement', impact: 'medium', detail: `Engagement at ${employee.engagementScore}/100 vs team avg 72` });
  }

  const history = employee.performanceHistory;
  if (history.length >= 2) {
    const recent = history[history.length - 1].score;
    const earlier = history[Math.max(0, history.length - 4)].score;
    if (recent < earlier - 10) {
      factors.push({ factor: 'Performance Decline', impact: 'high', detail: `Dropped from ${earlier.toFixed(0)} to ${recent.toFixed(0)} over recent months` });
    }
  }

  if (employee.tenure < 6) {
    factors.push({ factor: 'New Employee', impact: 'medium', detail: `Only ${employee.tenure} months tenure — still in onboarding phase` });
  }

  return factors.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.impact] - order[b.impact];
  });
}
