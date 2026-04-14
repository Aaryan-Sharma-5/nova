import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
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
                        <button className="inline-flex items-center text-blue-700 hover:text-blue-800">
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
                  )}
                </div>
              </div>
              <div className="h-2 w-full rounded-full border border-foreground bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${scoreToday}%` }}
                />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-semibold">Why did this score change?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Today: {scoreToday}% vs 7 days ago: {score7dAgo}%
                </p>
                {hasBackendCompositeSignal && backendComposite?.changed_signals && backendComposite.changed_signals.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
                    {backendComposite.changed_signals.slice(0, 3).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-700 mt-1">
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
      <AskNovaPanel />
    </div>
  );
}
