import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StructuredInsight } from "./hooks/useInsights";

type BurnoutRiskCardProps = {
  risk_level: string;
  risk_score: number;
  factors: string[];
  recommendation: string;
  structured_insight: StructuredInsight;
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-emerald-200 text-emerald-900",
  medium: "bg-amber-200 text-amber-900",
  high: "bg-orange-200 text-orange-900",
  critical: "bg-rose-200 text-rose-900",
};

export function BurnoutRiskCard({
  risk_level,
  risk_score,
  factors,
  recommendation,
  structured_insight,
}: BurnoutRiskCardProps) {
  const badgeClass = RISK_STYLES[risk_level] ?? "bg-muted text-foreground";

  return (
    <Card className="h-full">
      <CardHeader className="flex items-start justify-between gap-2">
        <CardTitle className="text-lg">Burnout Risk</CardTitle>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badgeClass)}>
          {risk_level}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Risk Score</span>
            <span>{risk_score.toFixed(2)}</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full border border-foreground bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(risk_score * 100)}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(structured_insight.key_signals.length ? structured_insight.key_signals : factors).map((factor, index) => (
            <Badge key={`${factor}-${index}`} variant="secondary">
              {factor}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-foreground leading-relaxed">{structured_insight.summary}</p>
        <div className="rounded-md border border-blue-300 bg-blue-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Recommended Action</p>
          <p className="text-sm text-blue-900">{structured_insight.recommended_action || recommendation}</p>
        </div>
      </CardContent>
    </Card>
  );
}
