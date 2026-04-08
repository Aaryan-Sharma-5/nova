import React from 'react';
import { AlertTriangle, TrendingDown, Users, MessageSquare, Zap, Info, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AnomalyData {
  detected: boolean;
  type: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  z_score: number;
  description: string;
}

interface AnomalyIndicatorProps {
  sentiment?: AnomalyData;
  engagement?: AnomalyData;
  performance?: AnomalyData;
  communication?: AnomalyData;
  composite?: {
    detected: boolean;
    reason: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    temporal_weight_applied?: boolean;
    recency_boost_reason?: string;
    score_today?: number;
    score_7d_ago?: number;
    weighted_contributions?: {
      burnout: number;
      sentiment: number;
      time_at_risk: number;
      anomaly: number;
    };
    changed_signals?: string[];
  };
  compact?: boolean;
  isLoading?: boolean;
  emptyStateMessage?: string;
}

const severityColors: Record<string, { badge: string; icon: string; bg: string }> = {
  low: { badge: 'bg-blue-100 text-blue-800', icon: 'text-blue-500', bg: 'bg-blue-50' },
  medium: {
    badge: 'bg-yellow-100 text-yellow-800',
    icon: 'text-yellow-500',
    bg: 'bg-yellow-50',
  },
  high: {
    badge: 'bg-orange-100 text-orange-800',
    icon: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  critical: { badge: 'bg-red-100 text-red-800', icon: 'text-red-600', bg: 'bg-red-50' },
};

const AnomalyIndicator: React.FC<AnomalyIndicatorProps> = ({
  sentiment,
  engagement,
  performance,
  communication,
  composite,
  compact = false,
  isLoading = false,
  emptyStateMessage = 'No anomaly signals available for this employee yet.',
}) => {
  const contributionBars = composite?.weighted_contributions
    ? [
        { label: 'Burnout (35%)', value: composite.weighted_contributions.burnout },
        { label: 'Sentiment (25%)', value: composite.weighted_contributions.sentiment },
        { label: 'Time at Risk (20%)', value: composite.weighted_contributions.time_at_risk },
        { label: 'Anomaly (20%)', value: composite.weighted_contributions.anomaly },
      ]
    : [];
  const scoreDelta =
    typeof composite?.score_today === 'number' && typeof composite?.score_7d_ago === 'number'
      ? Math.round((composite.score_today - composite.score_7d_ago) * 100)
      : 0;

  const anomalies = [
    { label: 'Sentiment', data: sentiment, icon: TrendingDown },
    { label: 'Engagement', data: engagement, icon: Zap },
    { label: 'Performance', data: performance, icon: TrendingDown },
    { label: 'Communication', data: communication, icon: MessageSquare },
  ].filter((a) => a.data);

  const detectedAnomalies = anomalies.filter((a) => a.data?.detected);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (compact) {
    // Compact view: just show composite or detection count
    if (composite?.detected) {
      return (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
            severityColors[composite.severity].badge
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          {detectedAnomalies.length} Anomal{detectedAnomalies.length === 1 ? 'y' : 'ies'}
        </div>
      );
    }
    if (anomalies.length === 0) {
      return <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>;
    }
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-50 text-emerald-700">
        <Users className="w-4 h-4" />
        No active anomalies
      </div>
    );
  }

  // Full view: show all anomalies with details
  return (
    <div className="space-y-4">
      {/* Composite Result */}
      {composite && (
        <div
          className={`border-l-4 p-4 rounded-r-lg ${severityColors[composite.severity].bg} border-l-4 border-l-${
            composite.severity === 'critical'
              ? 'red-500'
              : composite.severity === 'high'
              ? 'orange-500'
              : composite.severity === 'medium'
              ? 'yellow-500'
              : 'blue-500'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`mt-0.5 flex-shrink-0 ${
                severityColors[composite.severity].icon
              }`}
              size={20}
            />
            <div>
              <p className="font-semibold">Behavioral Anomalies Detected</p>
              <p className="text-sm mt-1">{composite.reason}</p>
              {typeof composite.score_today === 'number' && (
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Composite risk: {(composite.score_today * 100).toFixed(1)}%
                  </p>
                  {scoreDelta !== 0 && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        scoreDelta > 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {scoreDelta > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(scoreDelta)} pts vs 7d
                    </span>
                  )}
                </div>
              )}
              <span
                className={`inline-block mt-2 px-2 py-1 rounded text-xs font-semibold ${
                  severityColors[composite.severity].badge
                }`}
              >
                {composite.severity.toUpperCase()}
              </span>
              {composite.temporal_weight_applied && (
                <p className="text-xs mt-1 text-orange-700">Temporal weighting applied</p>
              )}

              {contributionBars.length > 0 && (
                <div className="mt-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">
                        <Info className="h-3.5 w-3.5" /> Risk Score Breakdown
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Weighted contribution bars (using 35/25/20/20 base weights).
                        </p>
                        {contributionBars.map((bar) => (
                          <div key={bar.label} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{bar.label}</span>
                              <span>{bar.value.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 w-full rounded bg-slate-200">
                              <div
                                className="h-2 rounded bg-blue-600"
                                style={{ width: `${Math.max(0, Math.min(bar.value, 100))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {typeof composite.score_today === 'number' && typeof composite.score_7d_ago === 'number' && (
                <div className="mt-3 rounded border border-slate-200 bg-white/80 p-2">
                  <p className="text-xs font-semibold">Why did this score change?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Today: {(composite.score_today * 100).toFixed(1)}% vs 7d ago: {(composite.score_7d_ago * 100).toFixed(1)}%
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
                    {(composite.changed_signals && composite.changed_signals.length > 0
                      ? composite.changed_signals
                      : ['No significant component changes detected']).slice(0, 3).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  {composite.recency_boost_reason && (
                    <p className="mt-1 text-xs text-orange-700">{composite.recency_boost_reason}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Individual Anomalies */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm text-gray-700">Detailed Analysis</h4>
        {anomalies.length === 0 ? (
          <p className="text-sm text-gray-500">{emptyStateMessage}</p>
        ) : (
          <div className="space-y-2">
            {anomalies.map((anomaly, idx) => {
              const Icon = anomaly.icon;
              const severity = anomaly.data?.severity || 'low';

              return (
                <div
                  key={idx}
                  className={`p-3 rounded border-l-2 ${
                    anomaly.data?.detected
                      ? `${severityColors[severity].bg} border-l-${
                          severity === 'critical'
                            ? 'red-500'
                            : severity === 'high'
                            ? 'orange-500'
                            : severity === 'medium'
                            ? 'yellow-500'
                            : 'blue-500'
                        }`
                      : 'bg-gray-50 border-l-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={`mt-0.5 flex-shrink-0 w-4 h-4 ${
                        anomaly.data?.detected
                          ? severityColors[severity].icon
                          : 'text-gray-400'
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{anomaly.label}</p>
                        {anomaly.data?.detected && (
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              severityColors[severity].badge
                            }`}
                          >
                            {severity.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {anomaly.data?.description && (
                        <p className="text-sm mt-1 text-gray-600">
                          {anomaly.data.description}
                        </p>
                      )}
                      {anomaly.data?.detected && anomaly.data?.z_score && (
                        <p className="text-xs text-gray-500 mt-1">
                          Z-score: {anomaly.data.z_score.toFixed(2)} σ
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnomalyIndicator;
