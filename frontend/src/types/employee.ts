export interface Employee {
  id: string;
  name: string;
  email: string;
  department: Department;
  role: string;
  tenure: number; // months
  performanceScore: number; // 0-100
  engagementScore: number; // 0-100
  sentimentScore: number; // -1 to 1
  burnoutRisk: number; // 0-100
  attritionRisk: number; // 0-100
  workHoursPerWeek: number;
  projectLoad: number;
  absenceDays: number;
  lastAssessment: string;
  recentFeedback: string[];
  performanceHistory: TimePoint[];
  sentimentHistory: TimePoint[];
  avatar?: string;
}

export interface TimePoint {
  date: string;
  score: number;
}

export type Department = 'Engineering' | 'Sales' | 'Marketing' | 'HR' | 'Operations' | 'Finance' | 'Product' | 'Design';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface EmotionSpectrum {
  stress: number;
  frustration: number;
  disengagement: number;
  satisfaction: number;
  enthusiasm: number;
  anxiety: number;
}

export interface SentimentResult {
  score: number; // -1 to 1
  label: 'Positive' | 'Neutral' | 'Negative';
  confidence: number; // 0-100
  polarity?: number;
  emotions?: EmotionSpectrum;
  dominant_emotion?: keyof EmotionSpectrum;
  trend_delta_14d?: EmotionSpectrum;
  trend_delta_7d?: EmotionSpectrum;
  emotion_breakdown?: Record<string, number>;
  keywords: { word: string; sentiment: 'positive' | 'negative' | 'neutral'; weight: number }[];
  metadata?: {
    attritionRisk: boolean;
    mentalHealthConcern: boolean;
    criticalIssue: boolean;
    textLength: number;
    wordCount: number;
  };
}

export interface DepartmentRisk {
  department: Department;
  avgBurnoutRisk: number;
  avgAttritionRisk: number;
  avgSentiment: number;
  employeeCount: number;
}

export function getRiskLevel(score: number): RiskLevel {
  if (score < 30) return 'low';
  if (score < 60) return 'medium';
  return 'high';
}

export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'risk-low';
    case 'medium': return 'risk-medium';
    case 'high': return 'risk-high';
  }
}
