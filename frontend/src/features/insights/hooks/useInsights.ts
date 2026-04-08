import { useEffect, useState } from "react";
import { protectedGetApi, protectedPostApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployees } from "@/contexts/EmployeeContext";

export type StructuredInsight = {
  summary: string;
  key_signals: string[];
  recommended_action: string;
  confidence: "high" | "medium" | "low";
  urgency: "immediate" | "this_week" | "monitor";
};

export type SentimentInsight = {
  score: number;
  label: string;
  summary: string;
  confidence: number;
  structured_insight: StructuredInsight;
};

export type BurnoutInsight = {
  risk_level: string;
  risk_score: number;
  factors: string[];
  recommendation: string;
  structured_insight: StructuredInsight;
};

export type PerformanceInsight = {
  predicted_band: string;
  confidence: number;
  narrative: string;
  suggested_actions: string[];
  structured_insight: StructuredInsight;
};

export type RetentionInsight = {
  retention_risk: string;
  flight_risk_score: number;
  key_reasons: string[];
  retention_actions: string[];
  structured_insight: StructuredInsight;
};

export type CompositeAnomalyInsight = {
  detected: boolean;
  reason: string;
  severity: "low" | "medium" | "high" | "critical";
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

export type InsightsPayload = {
  sentiment: SentimentInsight;
  burnout: BurnoutInsight;
  performance: PerformanceInsight;
  retention: RetentionInsight;
  composite?: CompositeAnomalyInsight;
};

export function useInsights(employeeId?: string) {
  const { token } = useAuth();
  const { getEmployee } = useEmployees();
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchInsights() {
      if (!employeeId) {
        setError("Missing employee id.");
        return;
      }
      if (!token) {
        setError("You must be signed in to view insights.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const employee = getEmployee(employeeId);
        if (!employee) {
          throw new Error("Employee not found.");
        }

        const overtimeHours = Math.max(0, employee.workHoursPerWeek - 40);
        const meetingLoadHours = Math.round(employee.projectLoad * 6);
        const kpiCompletionRate = Math.max(0, Math.min(1, employee.performanceScore / 100));
        const peerReviewScore = Math.max(0, Math.min(1, employee.engagementScore / 100));
        const burnoutRiskScore = Math.max(0, Math.min(1, employee.burnoutRisk / 100));
        const performanceBand = employee.performanceScore >= 80
          ? "top"
          : employee.performanceScore >= 60
            ? "solid"
            : "at-risk";

        const params = new URLSearchParams();
        employee.recentFeedback.forEach((text) => params.append("texts", text));
        params.set("overtime_hours", overtimeHours.toString());
        params.set("pto_days_unused", "0");
        params.set("sentiment_score", employee.sentimentScore.toString());
        params.set("meeting_load_hours", meetingLoadHours.toString());
        params.set("tenure_months", employee.tenure.toString());
        params.set("kpi_completion_rate", kpiCompletionRate.toString());
        params.set("peer_review_score", peerReviewScore.toString());
        params.set("recent_projects_completed", employee.projectLoad.toString());
        params.set("burnout_risk_score", burnoutRiskScore.toString());
        params.set("performance_band", performanceBand);
        params.set("salary_band", "mid");
        params.set("last_promotion_months_ago", Math.min(employee.tenure, 24).toString());

        const payload = await protectedGetApi<InsightsPayload>(
          `/api/ai/insights/${employeeId}?${params.toString()}`,
          token,
        );

        const anomalyPayload = await protectedPostApi<{
          composite_result: CompositeAnomalyInsight;
        }>("/api/interventions/anomalies", token, {
          employee_id: employeeId,
          sentiment_history: employee.sentimentHistory.slice(-6).map((p) => p.score),
          sentiment_dates: employee.sentimentHistory.slice(-6).map((p) => p.date),
          engagement_history: [employee.engagementScore],
          engagement_dates: [new Date().toISOString().split("T")[0]],
          performance_history: employee.performanceHistory.slice(-6).map((p) => p.score),
          performance_dates: employee.performanceHistory.slice(-6).map((p) => p.date),
          message_counts: [],
          message_dates: [new Date().toISOString().split("T")[0]],
        });

        if (isMounted) {
          setData({
            ...payload,
            composite: anomalyPayload.composite_result,
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load insights.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchInsights();

    return () => {
      isMounted = false;
    };
  }, [employeeId, token, getEmployee]);

  return { data, loading, error };
}
