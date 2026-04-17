import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StructuredInsight } from "./hooks/useInsights";

type SentimentCardProps = {
  score: number;
  label: string;
  summary: string;
  confidence: number;
  structured_insight: StructuredInsight;
};

const LABEL_STYLES: Record<string, string> = {
  positive: "bg-emerald-200 text-emerald-900",
  neutral: "bg-slate-200 text-slate-900",
  negative: "bg-rose-200 text-rose-900",
};

export function SentimentCard({ score, label, summary, confidence, structured_insight }: SentimentCardProps) {
  const normalized = Math.round(((score + 1) / 2) * 100);
  const badgeClass = LABEL_STYLES[label] ?? "bg-muted text-foreground";
  const isDarkTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <Card className="h-full">
      <CardHeader className="flex items-start justify-between gap-2">
        <CardTitle className="text-lg">Sentiment</CardTitle>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badgeClass)}>
          {label}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Score</span>
            <span>{score.toFixed(2)}</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full border border-foreground bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${normalized}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{structured_insight.summary || summary}</p>
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
          <p className="text-sm" style={{ color: isDarkTheme ? '#e2e8f0' : '#1e3a8a' }}>{structured_insight.recommended_action}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Confidence: {Math.round(confidence * 100)}%
        </p>
      </CardContent>
    </Card>
  );
}
