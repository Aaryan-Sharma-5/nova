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
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
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
            const payload = await protectedPostApi<AnomalyResponse>('/api/interventions/anomalies', token, {
              employee_id: employee.id,
              sentiment_history: employee.sentimentHistory.slice(-6).map((point) => point.score),
              sentiment_dates: employee.sentimentHistory.slice(-6).map((point) => point.date),
              engagement_history: [employee.engagementScore],
              engagement_dates: [new Date().toISOString().split('T')[0]],
              performance_history: employee.performanceHistory.slice(-6).map((point) => point.score),
              performance_dates: employee.performanceHistory.slice(-6).map((point) => point.date),
              message_counts: [],
              message_dates: [new Date().toISOString().split('T')[0]],
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
        <h1 className="text-2xl font-bold">Anomaly Alerts</h1>
        <p className="text-sm text-muted-foreground">Behavioral shifts detected from sentiment, engagement, performance, and communication signals.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
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
            <div key={`${row.employeeId}-${row.anomalyType}-${index}`} className="rounded border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold capitalize">{row.anomalyType}</p>
                <Badge className={severityClass[row.severity]}>{row.severity.toUpperCase()}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Detected date: {row.detectedDate}</p>
              <p className="text-xs">Employee: {row.employeeName}</p>
              <p className="text-xs text-slate-700">{row.explanation}</p>
              <Link to={`/employees/${row.employeeId}/profile`} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800">
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
