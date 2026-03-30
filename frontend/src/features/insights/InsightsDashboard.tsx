import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (!employeeId) {
    return <p className="text-sm text-muted-foreground">Select an employee to view insights.</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
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
