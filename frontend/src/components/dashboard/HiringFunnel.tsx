import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { protectedGetApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import html2canvas from "html2canvas";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type FunnelStage = {
  stage: string;
  count: number;
};

type HiringFunnelPayload = {
  current: FunnelStage[];
  previous: FunnelStage[];
  time_to_fill_days: number;
};

export default function HiringFunnel() {
  const { token } = useAuth();
  const [payload, setPayload] = useState<HiringFunnelPayload>({
    current: [],
    previous: [],
    time_to_fill_days: 0,
  });
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setPayload({ current: [], previous: [], time_to_fill_days: 0 });
        return;
      }

      try {
        const next = await protectedGetApi<HiringFunnelPayload>("/api/org/hiring-funnel", token);
        setPayload(next);
      } catch {
        setPayload({ current: [], previous: [], time_to_fill_days: 0 });
      }
    };

    void load();
  }, [token]);

  const current = payload.current;
  const previous = payload.previous;
  const hasCurrentData = current.some((stage) => stage.count > 0);
  const hasPreviousData = previous.some((stage) => stage.count > 0);
  const hasAnyData = hasCurrentData || hasPreviousData;
  const activeFunnelStages = hasCurrentData ? current : previous;

  const stageOrder = useMemo(
    () => Array.from(new Set([...current.map((stage) => stage.stage), ...previous.map((stage) => stage.stage)])),
    [current, previous],
  );

  const combinedData = useMemo(() => {
    const previousByStage = new Map(previous.map((stage) => [stage.stage, stage.count]));
    const currentByStage = new Map(current.map((stage) => [stage.stage, stage.count]));

    return stageOrder.map((stage, index) => {
      const currentCount = currentByStage.get(stage) ?? 0;
      const previousCount = previousByStage.get(stage) ?? 0;
      const previousStage = stageOrder[index - 1];
      const prevCurrentCount = previousStage ? currentByStage.get(previousStage) ?? 0 : 0;
      const prevPreviousCount = previousStage ? previousByStage.get(previousStage) ?? 0 : 0;

      return {
        stage,
        currentCount,
        previousCount,
        currentConversion:
          index === 0
            ? 100
            : Number(((currentCount / Math.max(prevCurrentCount || 1, 1)) * 100).toFixed(1)),
        previousConversion:
          index === 0
            ? 100
            : Number(((previousCount / Math.max(prevPreviousCount || 1, 1)) * 100).toFixed(1)),
      };
    });
  }, [current, previous, stageOrder]);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "hiring-funnel.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const funnelColors = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#c026d3'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-blue-600">Current Q:</span>
              <span className="font-medium">{data.currentCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Previous Q:</span>
              <span className="font-medium">{data.previousCount}</span>
            </div>
            <div className="pt-2 mt-2 border-t">
              <div className="flex justify-between gap-4">
                <span className="text-blue-600">Conversion:</span>
                <span className="font-medium">{data.currentConversion}%</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Prev Conversion:</span>
                <span className="font-medium">{data.previousConversion}%</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const calculateTimeToFill = () => payload.time_to_fill_days;

  const calculateOverallConversion = () => {
    const accepted = current.find((stage) => stage.stage === "Accepted")?.count || 0;
    const applied = current.find((stage) => stage.stage === "Applied")?.count || 1;
    return ((accepted / applied) * 100).toFixed(1);
  };

  const quarterDelta = useMemo(() => {
    const currentAccepted = current.find((stage) => stage.stage === "Accepted")?.count || 0;
    const previousAccepted = previous.find((stage) => stage.stage === "Accepted")?.count || 0;
    if (previousAccepted === 0) {
      return currentAccepted > 0 ? 100 : 0;
    }
    return Number((((currentAccepted - previousAccepted) / previousAccepted) * 100).toFixed(0));
  }, [current, previous]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Hiring Funnel & Time-to-Fill</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={chartRef}>
          <div className="mb-6">
            {activeFunnelStages.map((stage, index) => {
              const width = 100 - index * 15;
              const prevStage = index > 0 ? activeFunnelStages[index - 1] : null;
              const conversionFromPrev = prevStage
                ? ((stage.count / Math.max(prevStage.count || 1, 1)) * 100).toFixed(0)
                : "100";

              return (
                <div key={stage.stage} className="mb-2">
                  <div
                    className="relative mx-auto rounded-lg flex items-center justify-between px-6 py-4 transition-all hover:scale-105"
                    style={{
                      width: `${width}%`,
                      backgroundColor: funnelColors[index % funnelColors.length],
                      minWidth: "200px",
                    }}
                  >
                    <div className="text-white">
                      <p className="font-semibold text-sm">{stage.stage}</p>
                      <p className="text-xs opacity-90">{index > 0 && `${conversionFromPrev}% conversion`}</p>
                    </div>
                    <div className="text-white text-right">
                      <p className="text-2xl font-bold">{stage.count}</p>
                      {index > 0 && (
                        <p className="text-xs opacity-90">
                          {stage.count > (previous[index]?.count || 0) ? "▲" : "▼"} {Math.abs(stage.count - (previous[index]?.count || 0))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!hasAnyData && (
              <div className="rounded-md border border-dashed p-6 text-center" style={{ backgroundColor: "var(--bg-secondary)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>No hiring funnel data available</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This chart is empty because no pipeline stages are returned for the selected period.
                </p>
              </div>
            )}

            {!hasCurrentData && hasPreviousData && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing previous-quarter stage progression until current-quarter data is available.
              </p>
            )}
          </div>

          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={combinedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: "Candidates", angle: -90, position: "insideLeft" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="currentCount" name="Current Quarter" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="previousCount" name="Previous Quarter" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{calculateTimeToFill()}</p>
            <p className="text-xs text-muted-foreground">Avg Time-to-Fill (days)</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{hasCurrentData ? `${calculateOverallConversion()}%` : "--"}</p>
            <p className="text-xs text-muted-foreground">Overall Conversion</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <p className="text-2xl font-bold text-green-600">{hasCurrentData ? `${quarterDelta > 0 ? "+" : ""}${quarterDelta}%` : "--"}</p>
            </div>
            <p className="text-xs text-muted-foreground">vs Last Quarter</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>Performance:</strong>{" "}
            {hasCurrentData
              ? `Applied-to-accepted conversion is ${calculateOverallConversion()}% with an average time-to-fill of ${calculateTimeToFill()} days.`
              : "Current-quarter hiring pipeline data has not populated yet."}{" "}
            Focus on early-stage screening throughput to improve final conversion.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
