import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';

type ScoreType = 'burnout' | 'attrition' | 'engagement';

type ExplanationItem = {
  feature: string;
  contribution: number;
  direction: string;
  plain_english: string;
};

type ExplanationResponse = {
  employee_id: string;
  score_type: ScoreType;
  explanations: ExplanationItem[];
  confidence_coverage: number;
  source: string;
};

export default function ScoreExplanationDrawer({
  employeeId,
  scoreType,
  className,
}: {
  employeeId: string;
  scoreType: ScoreType;
  className?: string;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ExplanationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!open || !token) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/explain/${scoreType}/${encodeURIComponent(employeeId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setData(null);
          return;
        }
        const payload = (await response.json()) as ExplanationResponse;
        setData(payload);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, token, scoreType, employeeId]);

  const chartData = useMemo(() => {
    return (data?.explanations || []).map((item) => ({
      feature: item.feature,
      contribution: Number(item.contribution),
      plainEnglish: item.plain_english,
    }));
  }, [data]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className={`text-xs underline text-muted-foreground hover:text-foreground ${className || ''}`}>
          Why this score?
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="capitalize">{scoreType} Score Explainability</SheetTitle>
          <SheetDescription>
            Top contributing factors and directionality for this score.
          </SheetDescription>
        </SheetHeader>

        {loading && <p className="text-sm text-muted-foreground mt-4">Loading explanation...</p>}

        {!loading && data && (
          <div className="mt-4 space-y-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 20 }}>
                  <XAxis type="number" domain={['dataMin', 'dataMax']} />
                  <YAxis type="category" dataKey="feature" width={140} />
                  <Tooltip
                    formatter={(value: number) => Number(value).toFixed(3)}
                    labelFormatter={(label) => `Feature: ${label}`}
                  />
                  <Bar dataKey="contribution" radius={[4, 4, 4, 4]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`${entry.feature}-${index}`} fill={entry.contribution >= 0 ? '#ef4444' : '#22c55e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {data.explanations.map((item) => (
                <div key={item.feature} className="rounded border p-3">
                  <p className="text-sm font-semibold">{item.feature}</p>
                  <p className="text-xs text-muted-foreground">{item.direction}</p>
                  <p className="text-sm mt-1">{item.plain_english}</p>
                </div>
              ))}
            </div>

            <div className="rounded border bg-muted/40 p-3">
              <p className="text-sm font-medium">
                This explanation covers {data.confidence_coverage.toFixed(0)}% of the score variance
              </p>
              <p className="text-xs text-muted-foreground mt-1">Source: {data.source}</p>
            </div>

            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}

        {!loading && !data && (
          <p className="text-sm text-muted-foreground mt-4">
            Explanation unavailable for this item right now.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
