import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployees } from "@/contexts/EmployeeContext";

type JiraMetrics = {
  employee_id: string;
  sprint_velocity: number;
  tickets_closed_7d: number;
  tickets_overdue: number;
  avg_ticket_resolution_hours: number;
  blocked_tickets_count: number;
  last_commit_days_ago: number;
  pr_review_participation_rate: number;
};

export default function JiraHealthPanel() {
  const { token } = useAuth();
  const { employees } = useEmployees();
  const [rows, setRows] = useState<Array<JiraMetrics & { name: string }>>([]);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setRows([]);
        return;
      }

      const sample = employees.slice(0, 6);
      try {
        const results = await Promise.all(
          sample.map(async (employee) => {
            const response = await fetch(`/api/integrations/jira/metrics/${employee.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return null;
            const payload = (await response.json()) as JiraMetrics;
            return { ...payload, name: employee.name };
          }),
        );
        setRows(results.filter((item): item is JiraMetrics & { name: string } => Boolean(item)));
      } catch {
        setRows([]);
      }
    };

    void load();
  }, [employees, token]);

  const teamAvgResolution = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((sum, row) => sum + row.avg_ticket_resolution_hours, 0) / rows.length;
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jira Health Signals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground border rounded p-2 bg-slate-50">
          Jira signals are objective performance data, not communication monitoring.
        </p>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.employee_id} className="rounded border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold truncate">{row.name}</p>
                {row.tickets_overdue > 2 ? (
                  <Badge variant="destructive">Overdue: {row.tickets_overdue}</Badge>
                ) : (
                  <Badge variant="secondary">Overdue: {row.tickets_overdue}</Badge>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded bg-muted px-2 py-1">Velocity: {row.sprint_velocity}</div>
                <div className="rounded bg-muted px-2 py-1">Closed 7d: {row.tickets_closed_7d}</div>
                <div className="rounded bg-muted px-2 py-1">
                  Resolution: {row.avg_ticket_resolution_hours}h
                  <span className="text-muted-foreground"> (team {teamAvgResolution.toFixed(1)}h)</span>
                </div>
                <div className="rounded bg-muted px-2 py-1">PR participation: {(row.pr_review_participation_rate * 100).toFixed(0)}%</div>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No Jira signals loaded.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
