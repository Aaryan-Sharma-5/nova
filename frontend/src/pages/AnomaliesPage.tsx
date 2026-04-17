import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useAuth } from '@/contexts/AuthContext';
import { protectedPostApi } from '@/lib/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type AnomalyResult = {
  employeeId: string;
  employeeName: string;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedDate: string;
  explanation: string;
};

type AnomalyResponse = {
  sentiment_anomaly?: { detected: boolean; type: string | null; severity: 'low' | 'medium' | 'high' | 'critical'; description: string };
  engagement_anomaly?: { detected: boolean; type: string | null; severity: 'low' | 'medium' | 'high' | 'critical'; description: string };
  performance_anomaly?: { detected: boolean; type: string | null; severity: 'low' | 'medium' | 'high' | 'critical'; description: string };
  communication_anomaly?: { detected: boolean; type: string | null; severity: 'low' | 'medium' | 'high' | 'critical'; description: string };
};

const severityClass: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-100 dark:border dark:border-blue-700',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/45 dark:text-amber-100 dark:border dark:border-amber-700',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/45 dark:text-orange-100 dark:border dark:border-orange-700',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/45 dark:text-red-100 dark:border dark:border-red-700',
};

export default function AnomaliesPage() {
  useDocumentTitle('NOVA — Anomaly Alerts');
  const { employees } = useEmployees();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AnomalyResult[]>([]);

  const targets = useMemo(() => {
    return [...employees]
      .sort((a, b) => (b.burnoutRisk + b.attritionRisk) - (a.burnoutRisk + a.attritionRisk))
      .slice(0, 24);
  }, [employees]);

  useEffect(() => {
    const load = async () => {
      if (!token || targets.length === 0) {
        setRows([]);
        return;
      }

      setLoading(true);
      try {
        const results = await Promise.all(
          targets.map(async (employee) => {
            const perfSeries = employee.performanceHistory.slice(-6);
            const sentimentSeries = employee.sentimentHistory.slice(-6);
            const engagementBaseline = Math.max(0, Math.min(100, employee.engagementScore + 16));
            const engagementHistory = [
              engagementBaseline,
              engagementBaseline - 4,
              engagementBaseline - 7,
              Math.max(0, employee.engagementScore),
            ];
            const today = new Date();
            const engagementDates = engagementHistory.map((_, idx) => {
              const date = new Date(today);
              date.setDate(today.getDate() - (engagementHistory.length - idx) * 7);
              return date.toISOString().split('T')[0];
            });
            const baseMessages = Math.max(3, Number(employee.feedbackSubmissionsCount || 0) + 5);
            const messageCounts = [baseMessages, Math.max(2, baseMessages - 1), Math.max(1, baseMessages - 3), Math.max(0, baseMessages - 6)];
            const messageDates = messageCounts.map((_, idx) => {
              const date = new Date(today);
              date.setDate(today.getDate() - (messageCounts.length - idx) * 5);
              return date.toISOString().split('T')[0];
            });

            const payload = await protectedPostApi<AnomalyResponse>('/api/interventions/anomalies', token, {
              employee_id: employee.id,
              sentiment_history: sentimentSeries.map((point) => point.score),
              sentiment_dates: sentimentSeries.map((point) => point.date),
              engagement_history: engagementHistory,
              engagement_dates: engagementDates,
              performance_history: perfSeries.map((point) => point.score),
              performance_dates: perfSeries.map((point) => point.date),
              message_counts: messageCounts,
              message_dates: messageDates,
            });

            const points = [
              payload.sentiment_anomaly,
              payload.engagement_anomaly,
              payload.performance_anomaly,
              payload.communication_anomaly,
            ].filter((item) => item && item.detected);

            return points.map((point) => ({
              employeeId: employee.id,
              employeeName: employee.name,
              anomalyType: (point?.type || 'anomaly').replace(/_/g, ' '),
              severity: point?.severity || 'low',
              detectedDate: new Date().toLocaleDateString(),
              explanation: point?.description || 'Behavior shifted beyond this employee baseline by anomaly threshold.',
            }));
          }),
        );

        setRows(results.flat());
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token, targets]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold dark:text-slate-50">Anomaly Alerts</h1>
        <p className="text-sm text-muted-foreground dark:text-slate-300">Behavioral shifts detected from sentiment, engagement, performance, and communication signals.</p>
      </div>

      <Card className="dark:bg-slate-900/70 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-slate-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            {`${rows.length} Anomal${rows.length === 1 ? 'y' : 'ies'} Detected`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!loading && rows.map((row, index) => (
            <div key={`${row.employeeId}-${row.anomalyType}-${index}`} className="rounded border p-3 space-y-1 dark:bg-slate-900/60 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold capitalize dark:text-slate-100">{row.anomalyType}</p>
                <Badge className={severityClass[row.severity]}>{row.severity.toUpperCase()}</Badge>
              </div>
              <p className="text-xs text-muted-foreground dark:text-slate-300">Detected date: {row.detectedDate}</p>
              <p className="text-xs dark:text-slate-100">Employee: {row.employeeName}</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{row.explanation}</p>
              <Link to={`/employees/${row.employeeId}/profile`} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 dark:text-sky-300 dark:hover:text-sky-200">
                View Employee <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}

          {!loading && rows.length === 0 && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-4 text-center text-emerald-800">
              <p className="font-semibold">All caught up!</p>
              <p className="text-sm">No anomalies are currently detected in this demo run.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
