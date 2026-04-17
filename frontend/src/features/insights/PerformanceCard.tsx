import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StructuredInsight } from "./hooks/useInsights";

type PerformanceCardProps = {
  predicted_band: string;
  confidence: number;
  narrative: string;
  suggested_actions: string[];
  structured_insight: StructuredInsight;
};

const BAND_STYLES: Record<string, string> = {
  top: "bg-emerald-200 text-emerald-900",
  solid: "bg-slate-200 text-slate-900",
  "at-risk": "bg-rose-200 text-rose-900",
};

export function PerformanceCard({
  predicted_band,
  confidence,
  narrative,
  suggested_actions,
  structured_insight,
}: PerformanceCardProps) {
  const badgeClass = BAND_STYLES[predicted_band] ?? "bg-muted text-foreground";
  const isDarkTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <Card className="h-full">
      <CardHeader className="flex items-start justify-between gap-2">
        <CardTitle className="text-lg">Performance</CardTitle>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badgeClass)}>
          {predicted_band}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed">{structured_insight.summary || narrative}</p>
        <p className="text-xs text-muted-foreground">
          Confidence: {Math.round(confidence * 100)}%
        </p>
        <div className="flex flex-wrap gap-2">
          {structured_insight.key_signals.map((signal, index) => (
            <Badge key={`${signal}-${index}`} variant="secondary">
              {signal}
            </Badge>
          ))}
        </div>
        <div
          className="rounded-md border p-3"
          style={{
            borderColor: isDarkTheme ? '#1e3a5f' : '#93c5fd',
            backgroundColor: isDarkTheme ? '#0f1f36' : '#eff6ff',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: isDarkTheme ? '#93c5fd' : '#1e3a8a' }}>Recommended Action</p>
          <p className="text-sm" style={{ color: isDarkTheme ? '#e2e8f0' : '#1e3a8a' }}>{structured_insight.recommended_action || suggested_actions[0]}</p>
        </div>
      </CardContent>
    </Card>
  );
}
