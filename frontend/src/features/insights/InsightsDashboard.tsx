import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEmployees } from "@/contexts/EmployeeContext";
import { calculateCompositeRisk } from "@/utils/riskCalculation";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { AskNovaPanel } from "./AskNovaPanel";
import { BurnoutRiskCard } from "./BurnoutRiskCard";
import { PerformanceCard } from "./PerformanceCard";
import { RetentionRiskCard } from "./RetentionRiskCard";
import { SentimentCard } from "./SentimentCard";
import { useInsights } from "./hooks/useInsights";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function InsightSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <Skeleton className="h-5 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </CardContent>
    </Card>
  );
}

export function InsightsDashboard() {
  useDocumentTitle('NOVA — AI Insights');
  const { employeeId } = useParams();
  const { data, loading, error } = useInsights(employeeId);
  const { getEmployee } = useEmployees();
  const employee = employeeId ? getEmployee(employeeId) : undefined;
  const isDarkTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const composite = employee
    ? calculateCompositeRisk({
        workHoursPerWeek: employee.workHoursPerWeek,
        projectLoad: employee.projectLoad,
        engagementScore: employee.engagementScore,
        sentimentHistory: employee.sentimentHistory,
        performanceHistory: employee.performanceHistory,
      })
    : null;

  const backendComposite = data?.composite;
  const hasBackendCompositeSignal = Boolean(
    backendComposite &&
      (
        backendComposite.detected ||
        (typeof backendComposite.score_today === "number" && backendComposite.score_today > 0) ||
        Object.values(backendComposite.weighted_contributions ?? {}).some((value) => value > 0)
      ),
  );

  const scoreToday = hasBackendCompositeSignal && backendComposite
    ? Math.round(backendComposite.score_today * 100)
    : composite?.score ?? 0;
  const score7dAgo = hasBackendCompositeSignal && backendComposite
    ? Math.round(backendComposite.score_7d_ago * 100)
    : composite?.score ?? 0;
  const scoreDelta = scoreToday - score7dAgo;

  const weightedBars = hasBackendCompositeSignal && backendComposite
    ? [
        { label: "Burnout (35%)", value: backendComposite.weighted_contributions.burnout },
        { label: "Sentiment (25%)", value: backendComposite.weighted_contributions.sentiment },
        { label: "Time at Risk (20%)", value: backendComposite.weighted_contributions.time_at_risk },
        { label: "Anomaly (20%)", value: backendComposite.weighted_contributions.anomaly },
      ]
    : [];

  if (!employeeId) {
    return <p className="text-sm text-muted-foreground">Select an employee to view insights.</p>;
  }

  return (
    <div className="space-y-6 insights-dark-theme">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Composite Risk Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !composite ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Overall Risk</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{scoreToday}%</span>
                  {scoreDelta !== 0 && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        scoreDelta > 0
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                      style={isDarkTheme ? { backgroundColor: scoreDelta > 0 ? '#3f1d1d' : '#113026', color: scoreDelta > 0 ? '#fca5a5' : '#86efac' } : undefined}
                    >
                      {scoreDelta > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(scoreDelta)} pts vs 7d
                    </span>
                  )}
                  {weightedBars.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="inline-flex items-center"
                          style={{ color: isDarkTheme ? '#93c5fd' : '#1d4ed8' }}
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">Risk Score Breakdown</p>
                          {weightedBars.map((bar) => (
                            <div key={bar.label} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>{bar.label}</span>
                                <span>{bar.value.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 w-full rounded" style={{ backgroundColor: isDarkTheme ? '#334155' : '#e2e8f0' }}>
                                <div
                                  className="h-2 rounded"
                                  style={{
                                    backgroundColor: isDarkTheme ? '#60a5fa' : '#2563eb',
                                    width: `${Math.max(0, Math.min(bar.value, 100))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
              <div className="h-2 w-full rounded-full border border-foreground bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${scoreToday}%` }}
                />
              </div>
              <div
                className="rounded-md border p-2"
                style={{
                  borderColor: isDarkTheme ? '#334155' : '#cbd5e1',
                  backgroundColor: isDarkTheme ? '#1e293b' : '#f8fafc',
                }}
              >
                <p className="text-xs font-semibold">Why did this score change?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Today: {scoreToday}% vs 7 days ago: {score7dAgo}%
                </p>
                {hasBackendCompositeSignal && backendComposite?.changed_signals && backendComposite.changed_signals.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-foreground">
                    {backendComposite.changed_signals.slice(0, 3).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-foreground mt-1">
                    No major anomaly shifts were detected; showing baseline composite risk from workload, sentiment, performance, and engagement.
                  </p>
                )}
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Sentiment trend: {composite.components.sentimentTrend}%</div>
                <div>Workload index: {composite.components.workloadIndex}%</div>
                <div>Behavioral change: {composite.components.behavioralChange}%</div>
                <div>Engagement risk: {composite.components.engagementRisk}%</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {loading || !data ? (
          <>
            <InsightSkeleton />
            <InsightSkeleton />
            <InsightSkeleton />
            <InsightSkeleton />
          </>
        ) : (
          <>
            <SentimentCard {...data.sentiment} />
            <BurnoutRiskCard {...data.burnout} />
            <PerformanceCard {...data.performance} />
            <RetentionRiskCard {...data.retention} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">LLM Action Playbook for HR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !data?.action_playbook ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div
                className="rounded-md border p-3"
                style={{
                  borderColor: isDarkTheme ? '#334155' : '#cbd5e1',
                  backgroundColor: isDarkTheme ? '#1e293b' : '#f8fafc',
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</p>
                <p className="text-sm text-foreground mt-1">{data.action_playbook.objective}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {data.action_playbook.priorities.slice(0, 3).map((priority, idx) => (
                  <div key={`${priority.metric}-${idx}`} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{priority.title}</p>
                      <Badge variant="outline" className="capitalize">{priority.metric}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Owner: <span className="font-medium text-foreground">{priority.owner}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Timeline: <span className="font-medium text-foreground">{priority.timeline}</span>
                    </p>
                    <ul className="list-disc pl-4 text-xs text-foreground space-y-1">
                      {priority.actions.slice(0, 2).map((action, actionIdx) => (
                        <li key={actionIdx}>{action}</li>
                      ))}
                    </ul>
                    <div
                      className="rounded border px-2 py-1"
                      style={{
                        borderColor: isDarkTheme ? '#14532d' : '#a7f3d0',
                        backgroundColor: isDarkTheme ? '#0f2a22' : '#ecfdf5',
                      }}
                    >
                      <p className="text-[11px]" style={{ color: isDarkTheme ? '#6ee7b7' : '#065f46' }}>Success signal: {priority.success_signal}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manager talking points</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-foreground space-y-1">
                  {data.action_playbook.manager_talking_points.slice(0, 4).map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  Check-in cadence: <span className="font-medium text-foreground">{data.action_playbook.check_in_cadence}</span>
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <AskNovaPanel />
    </div>
  );
}
