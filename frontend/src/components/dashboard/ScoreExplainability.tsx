import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi } from "@/lib/api";

type FeatureContribution = {
  feature: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  direction: "positive" | "negative";
  explanation: string;
};

type ExplainabilityResponse = {
  employee_id: string;
  top_features: FeatureContribution[];
  generated_from: string;
};

interface ScoreExplainabilityProps {
  employeeId: string | null;
  employeeName: string;
  open: boolean;
  onClose: () => void;
}

function ContributionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FeatureContribution }> }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const row = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-sm p-3 max-w-xs">
      <p className="text-sm font-semibold">{row.label}</p>
      <p className="text-xs text-slate-700 mt-1">{row.explanation}</p>
      <p className="text-xs text-slate-500 mt-1">Weight: {(row.weight * 100).toFixed(1)}%</p>
    </div>
  );
}

export default function ScoreExplainability({ employeeId, employeeName, open, onClose }: ScoreExplainabilityProps) {
  const { token } = useAuth();
  const [rows, setRows] = useState<FeatureContribution[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!open || !employeeId || !token) {
        return;
      }

      setLoading(true);
      try {
        const data = await protectedGetApi<ExplainabilityResponse>(
          `/api/ml/feature-importance/${employeeId}?top_k=10`,
          token,
        );
        if (mounted) {
          setRows(data.top_features);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setRows([]);
          setError(err instanceof Error ? err.message : "Failed to load explainability data");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, [open, employeeId, token]);

  const chartData = useMemo(() => [...rows].reverse(), [rows]);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Score Explainability - {employeeName}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Feature contributions to burnout risk. Positive values increase risk, negative values reduce risk.
          </p>

          {loading && <p className="text-sm text-slate-600">Loading feature contributions...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && rows.length > 0 && (
            <>
              <div className="border rounded-lg p-3 bg-slate-50">
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 24, left: 48, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ContributionTooltip />} />
                    <Bar dataKey="contribution" radius={[2, 2, 2, 2]}>
                      {chartData.map((entry, idx) => (
                        <Cell key={`${entry.feature}-${idx}`} fill={entry.contribution >= 0 ? "#ef4444" : "#22c55e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.feature} className="border rounded-md p-3 bg-white">
                    <p className="text-sm font-medium" style={{ color: row.contribution >= 0 ? "#b91c1c" : "#15803d" }}>
                      {row.label}: {row.contribution >= 0 ? "+" : ""}{row.contribution.toFixed(1)}% risk
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{row.explanation}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
