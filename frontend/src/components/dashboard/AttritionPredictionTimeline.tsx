import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ReferenceLine } from "recharts";
import { generateAttritionForecast } from "@/utils/mockAnalyticsData";
import { protectedGetApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import html2canvas from "html2canvas";
import { useEffect, useMemo, useRef, useState } from "react";

const ACCEPTABLE_ATTRITION_RATE = 10; // Configurable threshold

type EventMetricDelta = {
  metric: string;
  before_avg: number;
  after_avg: number;
  delta_pct: number;
};

type EventCorrelation = {
  event_id: string;
  event_type: string;
  description: string;
  date: string;
  affected_department: string | null;
  impact_summary: string;
  top_metric: string;
  top_delta_pct: number;
  metrics: EventMetricDelta[];
};

export default function AttritionPredictionTimeline() {
  const data = useMemo(() => generateAttritionForecast(), []);
  const chartRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();
  const [eventCorrelations, setEventCorrelations] = useState<EventCorrelation[]>([]);

  const eventsByMonth = useMemo(() => {
    const byMonth = new Map<string, EventCorrelation[]>();
    for (const event of eventCorrelations) {
      const month = new Date(event.date).toLocaleString("en-US", { month: "short" });
      const current = byMonth.get(month) ?? [];
      current.push(event);
      byMonth.set(month, current);
    }
    return byMonth;
  }, [eventCorrelations]);

  useEffect(() => {
    let mounted = true;

    async function loadEventCorrelations() {
      if (!token) {
        setEventCorrelations([]);
        return;
      }

      try {
        const correlations = await protectedGetApi<EventCorrelation[]>("/events/correlations?limit=30", token);
        if (mounted) {
          setEventCorrelations(correlations);
        }
      } catch {
        if (mounted) {
          setEventCorrelations([]);
        }
      }
    }

    void loadEventCorrelations();

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "attrition-forecast.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dept = payload[0].dataKey;
      const value = payload[0].value;
      const monthData = data.find(d => d.month === label);
      const monthEvents = eventsByMonth.get(label) ?? [];
      
      if (monthData && dept) {
        const atRiskCount = Math.round(value * 10); // Mock calculation
        return (
          <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
            <p className="font-semibold">{label}</p>
            <p className="text-sm text-blue-600">
              {dept.charAt(0).toUpperCase() + dept.slice(1)}: {value.toFixed(1)}%
            </p>
            <p className="text-sm text-red-600 mt-1">
              At-risk headcount: ~{atRiskCount} employees
            </p>
            {monthEvents.length > 0 && (
              <div className="mt-2 border-t pt-2">
                <p className="text-xs font-semibold text-slate-700 mb-1">Event Correlation</p>
                {monthEvents.slice(0, 2).map((event) => (
                  <div key={event.event_id} className="text-xs text-slate-700 mb-1">
                    <p className="font-medium">{event.event_type}</p>
                    <p className="text-slate-600">{event.impact_summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
    }
    return null;
  };

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>6-Month Attrition Forecast</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={chartRef}>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="engConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="salesConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="mktConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="opsConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ value: 'Attrition Rate (%)', angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '12px' }}
                iconType="line"
              />

              {[...eventsByMonth.entries()].map(([month, events]) => (
                <ReferenceLine
                  key={`${month}-${events[0]?.event_id ?? month}`}
                  x={month}
                  stroke="#dc2626"
                  strokeDasharray="3 3"
                  label={{
                    value: events.length > 1 ? `${events.length} events` : "event",
                    position: "top",
                    fill: "#dc2626",
                    fontSize: 10,
                  }}
                />
              ))}
              
              {/* Threshold line */}
              <ReferenceLine 
                y={ACCEPTABLE_ATTRITION_RATE} 
                stroke="#ef4444" 
                strokeDasharray="5 5"
                label={{ value: 'Acceptable Rate (10%)', position: 'right', fill: '#ef4444', fontSize: 11 }}
              />

              {/* Confidence bands */}
              <Area
                type="monotone"
                dataKey="engineeringUpper"
                stroke="none"
                fill="url(#engConfidence)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="engineeringLower"
                stroke="none"
                fill="white"
                fillOpacity={1}
              />

              {/* Forecast lines */}
              <Line 
                type="monotone" 
                dataKey="engineering" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Engineering"
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="sales" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                name="Sales"
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="marketing" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Marketing"
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="operations" 
                stroke="#f59e0b" 
                strokeWidth={2}
                name="Operations"
                dot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-800">
            <strong>Critical Insight:</strong> Sales department forecast exceeds acceptable threshold by month 4. 
            Recommend immediate retention interventions.
          </p>
        </div>
        {eventCorrelations.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-semibold text-red-800 mb-1">Recent Event Correlations</p>
            {eventCorrelations.slice(0, 3).map((event) => (
              <p key={event.event_id} className="text-xs text-red-700 mb-1">
                {new Date(event.date).toLocaleDateString()} - {event.impact_summary}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
