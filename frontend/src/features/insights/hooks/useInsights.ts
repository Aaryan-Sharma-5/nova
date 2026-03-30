import { useEffect, useState } from "react";
import { protectedGetApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export type SentimentInsight = {
  score: number;
  label: string;
  summary: string;
  confidence: number;
};

export type BurnoutInsight = {
  risk_level: string;
  risk_score: number;
  factors: string[];
  recommendation: string;
};

export type PerformanceInsight = {
  predicted_band: string;
  confidence: number;
  narrative: string;
  suggested_actions: string[];
};

export type RetentionInsight = {
  retention_risk: string;
  flight_risk_score: number;
  key_reasons: string[];
  retention_actions: string[];
};

export type InsightsPayload = {
  sentiment: SentimentInsight;
  burnout: BurnoutInsight;
  performance: PerformanceInsight;
  retention: RetentionInsight;
};

export function useInsights(employeeId?: string) {
  const { token } = useAuth();
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
        const payload = await protectedGetApi<InsightsPayload>(
          `/api/ai/insights/${employeeId}`,
          token,
        );
        if (isMounted) {
          setData(payload);
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
  }, [employeeId, token]);

  return { data, loading, error };
}
