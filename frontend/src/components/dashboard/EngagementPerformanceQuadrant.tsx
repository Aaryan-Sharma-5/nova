import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { generateQuadrantEmployees, QuadrantEmployee } from "@/utils/mockAnalyticsData";
import html2canvas from "html2canvas";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import ScoreExplanationDrawer from "@/components/explainability/ScoreExplanationDrawer";

export default function EngagementPerformanceQuadrant() {
  const data = generateQuadrantEmployees();
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<QuadrantEmployee | null>(null);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "engagement-performance-quadrant.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const getQuadrantColor = (quadrant: QuadrantEmployee['quadrant']): string => {
    switch (quadrant) {
      case 'stars': return "#22c55e";
      case 'engaged-underperformers': return "#eab308";
      case 'disengaged-high-performers': return "#f97316";
      case 'at-risk': return "#ef4444";
    }
  };

  const getQuadrantCounts = () => {
    return {
      stars: data.filter(e => e.quadrant === 'stars').length,
      engagedUnder: data.filter(e => e.quadrant === 'engaged-underperformers').length,
      disengagedHigh: data.filter(e => e.quadrant === 'disengaged-high-performers').length,
      atRisk: data.filter(e => e.quadrant === 'at-risk').length,
    };
  };

  const counts = getQuadrantCounts();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const emp: QuadrantEmployee = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
          <p className="font-semibold">{emp.name}</p>
          <p className="text-sm text-gray-600">{emp.role} - {emp.department}</p>
          <p className="text-sm text-blue-600">Engagement: {emp.engagement.toFixed(0)}%</p>
          <p className="text-sm text-purple-600">Performance: {emp.performance.toFixed(0)}%</p>
          <div className="mt-1 flex flex-col items-start gap-1">
            <ScoreExplanationDrawer employeeId={emp.id} scoreType="engagement" className="text-[11px]" />
            <ScoreExplanationDrawer employeeId={emp.id} scoreType="burnout" className="text-[11px]" />
          </div>
          <p className="text-xs text-gray-500 mt-1">Click to view profile</p>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Card className="col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>Engagement vs Performance Matrix</CardTitle>
          <ScoreExplanationDrawer employeeId="org-engagement-quadrant" scoreType="engagement" />
        </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className="relative">
            {/* Quadrant Labels */}
            <div className="absolute top-0 left-0 right-0 bottom-12 pointer-events-none z-10">
              <div className="grid grid-cols-2 grid-rows-2 h-full">
                <div className="flex items-start justify-start p-4">
                  <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-2">
                    <p className="text-xs font-semibold text-yellow-800">Engaged Underperformers</p>
                    <Badge variant="secondary" className="mt-1">{counts.engagedUnder}</Badge>
                  </div>
                </div>
                <div className="flex items-start justify-end p-4">
                  <div className="bg-green-100 border border-green-300 rounded-lg p-2">
                    <p className="text-xs font-semibold text-green-800">⭐ Stars</p>
                    <Badge variant="secondary" className="mt-1">{counts.stars}</Badge>
                  </div>
                </div>
                <div className="flex items-end justify-start p-4">
                  <div className="bg-red-100 border border-red-300 rounded-lg p-2">
                    <p className="text-xs font-semibold text-red-800">At Risk</p>
                    <Badge variant="secondary" className="mt-1">{counts.atRisk}</Badge>
                  </div>
                </div>
                <div className="flex items-end justify-end p-4">
                  <div className="bg-orange-100 border border-orange-300 rounded-lg p-2">
                    <p className="text-xs font-semibold text-orange-800">Flight Risk</p>
                    <Badge variant="secondary" className="mt-1">{counts.disengagedHigh}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={450}>
              <ScatterChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number" 
                  dataKey="engagement" 
                  name="Engagement"
                  domain={[0, 100]}
                  label={{ value: 'Engagement Score', position: 'insideBottom', offset: -10 }}
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="performance" 
                  name="Performance"
                  domain={[0, 100]}
                  label={{ value: 'Performance Score', angle: -90, position: 'insideLeft' }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                
                {/* Quadrant dividing lines */}
                <ReferenceLine x={50} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
                <ReferenceLine y={50} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
                
                <Scatter 
                  name="Employees" 
                  data={data} 
                  onClick={(data) => setSelectedEmployee(data)}
                  style={{ cursor: 'pointer' }}
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={getQuadrantColor(entry.quadrant)}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-sm text-orange-800">
              <strong>Alert:</strong> {counts.disengagedHigh} high-performing employees show low engagement - 
              immediate retention risk. Schedule 1:1s within 48 hours.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Employee Profile Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-medium">{selectedEmployee.department}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Role</p>
                  <p className="font-medium">{selectedEmployee.role}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Engagement Score</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {selectedEmployee.engagement.toFixed(0)}%
                  </p>
                  <ScoreExplanationDrawer employeeId={selectedEmployee.id} scoreType="engagement" className="mt-1 inline-block" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Performance Score</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {selectedEmployee.performance.toFixed(0)}%
                  </p>
                  <ScoreExplanationDrawer employeeId={selectedEmployee.id} scoreType="burnout" className="mt-1 inline-block" />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <Badge 
                  className="mt-1"
                  style={{ 
                    backgroundColor: getQuadrantColor(selectedEmployee.quadrant),
                    color: 'white'
                  }}
                >
                  {selectedEmployee.quadrant.split('-').map(w => 
                    w.charAt(0).toUpperCase() + w.slice(1)
                  ).join(' ')}
                </Badge>
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-2">Quick Actions</p>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full">
                    Schedule 1:1 Meeting
                  </Button>
                  <Button variant="outline" size="sm" className="w-full">
                    View Full Profile
                  </Button>
                  <Button variant="outline" size="sm" className="w-full">
                    Request Feedback
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
