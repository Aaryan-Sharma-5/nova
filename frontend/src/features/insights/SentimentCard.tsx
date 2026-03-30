import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SentimentCardProps = {
  score: number;
  label: string;
  summary: string;
  confidence: number;
};

const LABEL_STYLES: Record<string, string> = {
  positive: "bg-emerald-200 text-emerald-900",
  neutral: "bg-slate-200 text-slate-900",
  negative: "bg-rose-200 text-rose-900",
};

export function SentimentCard({ score, label, summary, confidence }: SentimentCardProps) {
  const normalized = Math.round(((score + 1) / 2) * 100);
  const badgeClass = LABEL_STYLES[label] ?? "bg-muted text-foreground";

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
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
        <p className="text-xs text-muted-foreground">
          Confidence: {Math.round(confidence * 100)}%
        </p>
      </CardContent>
    </Card>
  );
}
