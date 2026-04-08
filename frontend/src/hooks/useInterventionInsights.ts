import { useEffect, useState } from 'react';
import type { Employee } from '@/types/employee';
import { protectedPostApi } from '@/lib/api';
import type { AnomalyData } from '@/components/anomalies/AnomalyIndicator';
import type { InterventionRecommendation } from '@/components/interventions/InterventionRecommendations';

type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

type CompositeResult = {
  detected: boolean;
  reason: string;
  severity: SeverityLevel;
  temporal_weight_applied: boolean;
  recency_boost_reason: string;
  score_today: number;
  score_7d_ago: number;
  weighted_contributions: {
    burnout: number;
    sentiment: number;
    time_at_risk: number;
    anomaly: number;
  };
  changed_signals: string[];
};

type AnomalyResponse = {
  sentiment_anomaly: AnomalyData;
  engagement_anomaly: AnomalyData;
  performance_anomaly: AnomalyData;
  communication_anomaly: AnomalyData;
  composite_result: CompositeResult;
};

type RecommendationsResponse = {
  recommendations: InterventionRecommendation[];
  overall_urgency: SeverityLevel;
  reasoning: string;
};

export type InterventionInsightsData = {
  recommendations: InterventionRecommendation[];
  overallUrgency: SeverityLevel;
  reasoning: string;
};

export type AnomalyInsightsData = {
  sentiment?: AnomalyData;
  engagement?: AnomalyData;
  performance?: AnomalyData;
  communication?: AnomalyData;
  composite?: CompositeResult;
};

type UseInterventionInsightsOptions = {
  token: string | null;
  featuredEmployee?: Employee;
  includeAnomalies: boolean;
  includeRecommendations: boolean;
};

export function useInterventionInsights({
  token,
  featuredEmployee,
  includeAnomalies,
  includeRecommendations,
}: UseInterventionInsightsOptions) {
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [anomalyData, setAnomalyData] = useState<AnomalyInsightsData | null>(null);
  const [interventionsData, setInterventionsData] = useState<InterventionInsightsData | null>(null);

  useEffect(() => {
    if (!token || !featuredEmployee || (!includeAnomalies && !includeRecommendations)) {
      return;
    }

    const buildPerformanceBand = (score: number): 'top' | 'solid' | 'at-risk' => {
      if (score >= 80) {
        return 'top';
      }
      if (score >= 60) {
        return 'solid';
      }
      return 'at-risk';
    };

    const buildRetentionRisk = (score: number): 'low' | 'medium' | 'high' => {
      if (score >= 70) {
        return 'high';
      }
      if (score >= 40) {
        return 'medium';
      }
      return 'low';
    };

    const toHistory = (employee: Employee, key: 'sentiment' | 'performance') => {
      return key === 'sentiment'
        ? employee.sentimentHistory.slice(-6).map((point) => point.score)
        : employee.performanceHistory.slice(-6).map((point) => point.score);
    };

    const run = async () => {
      if (includeAnomalies) {
        setAnomalyLoading(true);
      }
      if (includeRecommendations) {
        setInterventionLoading(true);
      }

      try {
        let anomalyResponse: AnomalyResponse | null = null;

        if (includeAnomalies || includeRecommendations) {
          anomalyResponse = await protectedPostApi<AnomalyResponse>('/api/interventions/anomalies', token, {
            employee_id: featuredEmployee.id,
            sentiment_history: toHistory(featuredEmployee, 'sentiment'),
            sentiment_dates: featuredEmployee.sentimentHistory.slice(-6).map((point) => point.date),
            engagement_history: [featuredEmployee.engagementScore],
            engagement_dates: [new Date().toISOString().split('T')[0]],
            performance_history: toHistory(featuredEmployee, 'performance'),
            performance_dates: featuredEmployee.performanceHistory.slice(-6).map((point) => point.date),
            message_counts: [],
            message_dates: [new Date().toISOString().split('T')[0]],
          });

          setAnomalyData({
            sentiment: anomalyResponse.sentiment_anomaly,
            engagement: anomalyResponse.engagement_anomaly,
            performance: anomalyResponse.performance_anomaly,
            communication: anomalyResponse.communication_anomaly,
            composite: anomalyResponse.composite_result,
          });
        }

        if (includeRecommendations) {
          const recommendationResponse = await protectedPostApi<RecommendationsResponse>(
            '/api/interventions/recommendations',
            token,
            {
              employee_id: featuredEmployee.id,
              burnout_score: featuredEmployee.burnoutRisk / 100,
              sentiment_score: featuredEmployee.sentimentScore,
              performance_band: buildPerformanceBand(featuredEmployee.performanceScore),
              tenure_months: featuredEmployee.tenure,
              retention_risk: buildRetentionRisk(featuredEmployee.attritionRisk),
              recent_behavioral_changes: [],
              weeks_at_high_risk: featuredEmployee.burnoutRisk >= 60 ? 3 : 1,
              anomaly_detected: anomalyResponse?.composite_result.detected ?? false,
              anomaly_type: anomalyResponse?.composite_result.reason ?? null,
            },
          );

          setInterventionsData({
            recommendations: recommendationResponse.recommendations,
            overallUrgency: recommendationResponse.overall_urgency,
            reasoning: recommendationResponse.reasoning,
          });
        }
      } catch {
        if (includeAnomalies) {
          setAnomalyData(null);
        }
        if (includeRecommendations) {
          setInterventionsData(null);
        }
      } finally {
        setAnomalyLoading(false);
        setInterventionLoading(false);
      }
    };

    void run();
  }, [token, featuredEmployee, includeAnomalies, includeRecommendations]);

  return {
    anomalyLoading,
    interventionLoading,
    anomalyData,
    interventionsData,
  };
}
