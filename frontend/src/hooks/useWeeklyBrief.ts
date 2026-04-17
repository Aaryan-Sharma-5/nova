import { useEffect, useState } from 'react';
import { protectedGetApi } from '@/lib/api';

export type WeeklyBriefScope = 'org' | 'team';

export type WeeklyBriefStructuredInsight = {
  summary: string;
  key_signals: string[];
  recommended_action: string;
  confidence: 'high' | 'medium' | 'low';
  urgency: 'immediate' | 'this_week' | 'monitor';
};

export type WeeklyBriefResponse = {
  scope: WeeklyBriefScope;
  week_of: string;
  narrative: string | null;
  suppressed: boolean;
  suppression_reason?: string;
  structured_insight: WeeklyBriefStructuredInsight;
  context: Record<string, unknown> | null;
  word_count: number;
};

type UseWeeklyBriefOptions = {
  token: string | null;
  scope?: WeeklyBriefScope;
  teamId?: string | null;
  weekOffset?: number;
  enabled?: boolean;
};

export function useWeeklyBrief({ token, scope = 'org', teamId, weekOffset = 0, enabled = true }: UseWeeklyBriefOptions) {
  const [data, setData] = useState<WeeklyBriefResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !enabled) return;

    const params = new URLSearchParams({ scope, week_offset: String(weekOffset) });
    if (teamId) params.set('team_id', teamId);

    let cancelled = false;
    setLoading(true);
    setError(null);

    protectedGetApi<WeeklyBriefResponse>(`/api/reports/weekly-brief?${params.toString()}`, token)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load weekly brief');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, scope, teamId, weekOffset, enabled]);

  return { data, loading, error };
}
