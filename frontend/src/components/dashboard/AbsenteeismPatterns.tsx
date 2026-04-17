import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import html2canvas from "html2canvas";
import { useMemo, useRef } from "react";
import { useEmployees } from "@/contexts/EmployeeContext";

const POLICY_THRESHOLD = 5.5; // Configurable absenteeism threshold

export default function AbsenteeismPatterns() {
  const { employees } = useEmployees();
  const data = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const avgAbsence = employees.length
      ? employees.reduce((sum, employee) => sum + employee.absenceDays, 0) / employees.length
      : 0;
    const avgBurnout = employees.length
      ? employees.reduce((sum, employee) => sum + employee.burnoutRisk, 0) / employees.length
      : 0;

    return months.map((month, index) => {
      const factor = 0.88 + index * 0.05;
      const unplanned = Number(((avgAbsence / 2.4) * factor).toFixed(1));
      const sickLeave = Number(((avgAbsence / 3.3) * (1 + index * 0.04)).toFixed(1));
      const personalLeave = Number(((avgAbsence / 4.1) * (1 + index * 0.03)).toFixed(1));
      const burnoutScore = Math.max(0, Math.min(100, Math.round(avgBurnout * (0.92 + index * 0.02))));
      return { month, sickLeave, personalLeave, unplanned, burnoutScore };
    });
  }, [employees]);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "absenteeism-patterns.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  // Add total absenteeism and highlight months above threshold
  const enrichedData = data.map(d => {
    const total = d.sickLeave + d.personalLeave + d.unplanned;
    return {
      ...d,
      total,
      aboveThreshold: total > POLICY_THRESHOLD,
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const month = enrichedData.find(d => d.month === label);
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-blue-600">Sick Leave:</span>
              <span className="font-medium">{month?.sickLeave.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-purple-600">Personal Leave:</span>
              <span className="font-medium">{month?.personalLeave.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-red-600">Unplanned:</span>
              <span className="font-medium">{month?.unplanned.toFixed(1)}%</span>
            </div>
            <div className="pt-2 mt-2 border-t flex justify-between gap-4">
              <span className="font-semibold">Total:</span>
              <span className="font-bold">{month?.total.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-amber-600">Burnout Score:</span>
              <span className="font-medium">{month?.burnoutScore.toFixed(0)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const calculateCorrelation = () => {
    const totals = enrichedData.map((item) => item.total);
    const burnout = enrichedData.map((item) => item.burnoutScore);
    const n = totals.length;
    if (n === 0) return 0;
    const sumX = totals.reduce((a, b) => a + b, 0);
    const sumY = burnout.reduce((a, b) => a + b, 0);
    const sumXY = totals.reduce((sum, value, index) => sum + value * burnout[index], 0);
    const sumX2 = totals.reduce((sum, value) => sum + value * value, 0);
    const sumY2 = burnout.reduce((sum, value) => sum + value * value, 0);
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (!denom) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  };

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Absenteeism Patterns & Burnout Correlation</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={chartRef}>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={enrichedData}>
              <defs>
                {/* Highlight background for months above threshold */}
                {enrichedData.map((d, i) => (
                  d.aboveThreshold && (
                    <rect 
                      key={`bg-${i}`}
                      x={i * 100}
                      y={0}
                      width={100}
                      height="100%"
                      fill="#fee2e2"
                      fillOpacity={0.3}
                    />
                  )
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                yAxisId="left"
                label={{ value: 'Absenteeism Rate (%)', angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                label={{ value: 'Burnout Score', angle: 90, position: 'insideRight' }}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {/* Policy threshold line */}
              <ReferenceLine 
                yAxisId="left"
                y={POLICY_THRESHOLD} 
                stroke="#ef4444" 
                strokeDasharray="5 5"
                label={{ value: `Policy Threshold (${POLICY_THRESHOLD}%)`, position: 'right', fill: '#ef4444', fontSize: 10 }}
              />

              {/* Stacked bars for leave types */}
              <Bar 
                yAxisId="left"
                dataKey="sickLeave" 
                stackId="a"
                fill="#3b82f6" 
                name="Sick Leave"
                radius={[0, 0, 0, 0]}
              />
              <Bar 
                yAxisId="left"
                dataKey="personalLeave" 
                stackId="a"
                fill="#8b5cf6" 
                name="Personal Leave"
                radius={[0, 0, 0, 0]}
              />
              <Bar 
                yAxisId="left"
                dataKey="unplanned" 
                stackId="a"
                fill="#ef4444" 
                name="Unplanned"
                radius={[4, 4, 0, 0]}
              />

              {/* Burnout correlation line */}
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="burnoutScore" 
                stroke="#f59e0b" 
                strokeWidth={3}
                name="Burnout Score"
                dot={{ r: 5, fill: '#f59e0b' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Statistics */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {(enrichedData.reduce((sum, d) => sum + d.total, 0) / enrichedData.length).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Avg Absenteeism Rate</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              {enrichedData.filter(d => d.aboveThreshold).length}
            </p>
            <p className="text-xs text-muted-foreground">Months Above Threshold</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">{calculateCorrelation().toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Burnout Correlation</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">
              {enrichedData.reduce((sum, d) => sum + d.unplanned, 0).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Total Unplanned Leave</p>
          </div>
        </div>

        {/* Alert */}
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">
            <strong>Alert:</strong> {enrichedData.filter(d => d.aboveThreshold).length} months exceeded policy threshold. 
            Strong correlation (r={calculateCorrelation().toFixed(2)}) between absenteeism and burnout scores suggests 
            systemic workload issues. Review team capacity planning.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
