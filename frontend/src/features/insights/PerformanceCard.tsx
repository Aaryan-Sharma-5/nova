import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PerformanceCardProps = {
  predicted_band: string;
  confidence: number;
  narrative: string;
  suggested_actions: string[];
};

const BAND_STYLES: Record<string, string> = {
  top: "bg-emerald-200 text-emerald-900",
  solid: "bg-slate-200 text-slate-900",
  "at-risk": "bg-rose-200 text-rose-900",
};

export function PerformanceCard({ predicted_band, confidence, narrative, suggested_actions }: PerformanceCardProps) {
  const badgeClass = BAND_STYLES[predicted_band] ?? "bg-muted text-foreground";

  return (
    <Card className="h-full">
      <CardHeader className="flex items-start justify-between gap-2">
        <CardTitle className="text-lg">Performance</CardTitle>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", badgeClass)}>
          {predicted_band}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed">{narrative}</p>
        <p className="text-xs text-muted-foreground">
          Confidence: {Math.round(confidence * 100)}%
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {suggested_actions.map((action, index) => (
            <li key={`${action}-${index}`}>{action}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
