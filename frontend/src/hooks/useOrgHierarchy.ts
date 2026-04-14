import { useEffect, useState } from 'react';
import { protectedGetApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export type OrgNode = {
  id: string;
  name: string;
  role: string;
  department: string;
  org_level: number;
  tenure_months: number;
  burnout_score: number;
  engagement_score: number;
  sentiment_score: number;
  attrition_risk: number;
  is_at_risk: boolean;
  children: OrgNode[];
};

export type OrgStats = {
  total_levels: number;
  avg_span_of_control: number;
  deepest_chain: number;
  managers_count: number;
  ic_count: number;
};

export function useOrgHierarchy(rootId?: string | null) {
  const { token } = useAuth();
  const [data, setData] = useState<OrgNode | null>(null);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const path = rootId
      ? `/api/org/hierarchy/${encodeURIComponent(rootId)}/subtree`
      : '/api/org/hierarchy';
    Promise.all([
      protectedGetApi<OrgNode>(path, token),
      protectedGetApi<OrgStats>('/api/org/hierarchy/stats', token),
    ])
      .then(([tree, stats]) => {
        if (cancelled) return;
        setData(tree);
        setStats(stats);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, rootId]);

  return { data, stats, loading, error };
}
