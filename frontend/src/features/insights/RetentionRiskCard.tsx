import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RetentionRiskCardProps = {
  retention_risk: string;
  flight_risk_score: number;
  key_reasons: string[];
  retention_actions: string[];
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-emerald-200 text-emerald-900",
  medium: "bg-amber-200 text-amber-900",
  high: "bg-rose-200 text-rose-900",
};

export function RetentionRiskCard({
  retention_risk,
  flight_risk_score,
  key_reasons,
  retention_actions,
}: RetentionRiskCardProps) {
  const badgeClass = RISK_STYLES[retention_risk] ?? "bg-muted text-foreground";

  return (
    <Card className="h-full">
      <CardHeader className="flex items-start justify-between gap-2">
        <CardTitle className="text-lg">Retention Risk</CardTitle>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badgeClass)}>
          {retention_risk}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Flight Risk Score</span>
            <span>{flight_risk_score.toFixed(2)}</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full border border-foreground bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(flight_risk_score * 100)}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {key_reasons.map((reason, index) => (
            <span
              key={`${reason}-${index}`}
              className="rounded-full border border-foreground px-2 py-1 text-xs font-medium"
            >
              {reason}
            </span>
          ))}
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {retention_actions.map((action, index) => (
            <li key={`${action}-${index}`}>{action}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
