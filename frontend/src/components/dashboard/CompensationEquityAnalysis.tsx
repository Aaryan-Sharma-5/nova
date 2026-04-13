import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateCompensationData } from "@/utils/mockAnalyticsData";
import html2canvas from "html2canvas";
import { useRef } from "react";
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Bar, Scatter, ReferenceLine, Cell } from "recharts";

export default function CompensationEquityAnalysis() {
  const data = generateCompensationData();
  const chartRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "compensation-equity.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  // Transform data for box plot visualization
  const transformedData = data.map((d, i) => ({
    category: `${d.department}\n${d.role}`,
    index: i,
    min: d.min,
    q1: d.q1,
    median: d.median,
    q3: d.q3,
    max: d.max,
    salaries: d.salaries,
    iqrHeight: d.q3 - d.q1,
    outliers: d.salaries.filter(s => 
      s < d.q1 - 1.5 * (d.q3 - d.q1) || s > d.q3 + 1.5 * (d.q3 - d.q1)
    ),
  })).slice(0, 8); // Show subset for readability

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
          <p className="font-semibold text-xs mb-2">{item.category.replace('\n', ' - ')}</p>
          <div className="space-y-1 text-xs">
            <p>Max: ${(item.max / 1000).toFixed(0)}k</p>
            <p>Q3 (75%): ${(item.q3 / 1000).toFixed(0)}k</p>
            <p className="font-semibold">Median: ${(item.median / 1000).toFixed(0)}k</p>
            <p>Q1 (25%): ${(item.q1 / 1000).toFixed(0)}k</p>
            <p>Min: ${(item.min / 1000).toFixed(0)}k</p>
            {item.outliers.length > 0 && (
              <p className="text-orange-600 font-semibold mt-2">
                {item.outliers.length} outlier(s)
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate gender pay gap (mock data)
  const genderPayGap = 8.5; // percentage

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Compensation Equity Analysis</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={chartRef}>
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
            <p className="text-blue-900 font-semibold mb-2">Salary Quartile Visualization</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="inline-block w-3 h-3 bg-blue-400 mr-2"></span>Q1 (25th percentile)</div>
              <div><span className="inline-block w-3 h-3 bg-blue-600 mr-2"></span>IQR Height (Q1→Q3 range)</div>
              <div><span className="inline-block w-3 h-3 bg-slate-600 mr-2 rounded-full"></span>Min/Max</div>
              <div><span className="inline-block w-3 h-3 bg-orange-400 mr-2"></span>Outliers</div>
              <div><span className="inline-block w-3 h-3 bg-blue-900 mr-2"></span>Median</div>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={transformedData} margin={{ top: 20, right: 30, left: 60, bottom: 100 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="category" 
                angle={-45}
                textAnchor="end"
                height={120}
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                type="number"
                label={{ value: 'Salary ($)', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Q1 base bar */}
              <Bar 
                dataKey="q1" 
                fill="#60a5fa" 
                fillOpacity={0.8}
                name="Q1 (25%)"
                radius={[0, 0, 4, 4]}
              />

              {/* IQR stacked bar showing the quartile range */}
              <Bar 
                dataKey="iqrHeight" 
                stackId="a"
                fill="#3b82f6" 
                fillOpacity={0.7}
                name="Q1→Q3 Range"
              />

              {/* Average salary reference line */}
              <ReferenceLine 
                y={data.reduce((sum, d) => sum + d.median, 0) / data.length}
                stroke="#10b981" 
                strokeDasharray="5 5"
                label={{ value: `Avg Median: $${(data.reduce((sum, d) => sum + d.median, 0) / data.length / 1000).toFixed(0)}k`, position: 'topRight', fill: '#10b981', fontSize: 9, offset: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Details below chart */}
          <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
            {transformedData.slice(0, 4).map((item, idx) => (
              <div key={idx} className="p-2 bg-gray-50 rounded border">
                <p className="font-semibold text-gray-700 mb-1">{item.category.replace('\n', ' • ')}</p>
                <div className="space-y-1 text-gray-600">
                  <p>Min: ${(item.min / 1000).toFixed(0)}k</p>
                  <p>Q1: ${(item.q1 / 1000).toFixed(0)}k</p>
                  <p className="font-semibold text-blue-700">Median: ${(item.median / 1000).toFixed(0)}k</p>
                  <p>Q3: ${(item.q3 / 1000).toFixed(0)}k</p>
                  <p>Max: ${(item.max / 1000).toFixed(0)}k</p>
                  {item.outliers.length > 0 && (
                    <p className="text-orange-600 font-semibold">{item.outliers.length} outlier(s)</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              ${(data.reduce((sum, d) => sum + d.median, 0) / data.length / 1000).toFixed(0)}k
            </p>
            <p className="text-xs text-muted-foreground">Avg Median Salary</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">
              {transformedData.reduce((sum, d) => sum + d.outliers.length, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Outliers Detected</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{genderPayGap}%</p>
            <p className="text-xs text-muted-foreground">Gender Pay Gap</p>
          </div>
        </div>

        {/* Alert for equity issues */}
        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-orange-800">
              <strong>Equity Review Needed:</strong> {transformedData.reduce((sum, d) => sum + d.outliers.length, 0)} employees 
              flagged as compensation outliers (&gt;1.5x IQR). Gender pay gap of {genderPayGap}% exceeds policy threshold.
            </p>
            <Button variant="link" className="p-0 h-auto text-orange-700 text-sm mt-1">
              View detailed equity report →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
