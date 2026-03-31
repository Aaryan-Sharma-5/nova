import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployees } from "@/contexts/EmployeeContext";
import { calculateCompositeRisk } from "@/utils/riskCalculation";
import { AskNovaPanel } from "./AskNovaPanel";
import { BurnoutRiskCard } from "./BurnoutRiskCard";
import { PerformanceCard } from "./PerformanceCard";
import { RetentionRiskCard } from "./RetentionRiskCard";
import { SentimentCard } from "./SentimentCard";
import { useInsights } from "./hooks/useInsights";

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
                <span className="font-semibold">{composite.score}%</span>
              </div>
              <div className="h-2 w-full rounded-full border border-foreground bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${composite.score}%` }}
                />
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
