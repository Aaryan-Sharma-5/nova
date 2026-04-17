import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StructuredInsight } from "./hooks/useInsights";

type RetentionRiskCardProps = {
  retention_risk: string;
  flight_risk_score: number;
  key_reasons: string[];
  retention_actions: string[];
  structured_insight: StructuredInsight;
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
  structured_insight,
}: RetentionRiskCardProps) {
  const badgeClass = RISK_STYLES[retention_risk] ?? "bg-muted text-foreground";
  const isDarkTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

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
          {(structured_insight.key_signals.length ? structured_insight.key_signals : key_reasons).map((reason, index) => (
            <Badge key={`${reason}-${index}`} variant="secondary">
              {reason}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-foreground leading-relaxed">{structured_insight.summary}</p>
        <div
          className="rounded-md border p-3"
          style={{
            borderColor: isDarkTheme ? '#1e3a5f' : '#93c5fd',
            backgroundColor: isDarkTheme ? '#0f1f36' : '#eff6ff',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: isDarkTheme ? '#93c5fd' : '#1e3a8a' }}>Recommended Action</p>
          <p className="text-sm" style={{ color: isDarkTheme ? '#e2e8f0' : '#1e3a8a' }}>{structured_insight.recommended_action || retention_actions[0]}</p>
        </div>
      </CardContent>
    </Card>
  );
}
