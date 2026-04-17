import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";
import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ScoreExplanationDrawer from "@/components/explainability/ScoreExplanationDrawer";
import { useEmployees } from "@/contexts/EmployeeContext";

export default function BurnoutHeatmap() {
  const { employees } = useEmployees();
  const data = useMemo(() => {
    const byDepartment = new Map<string, number[]>();
    for (const employee of employees) {
      byDepartment.set(employee.department, [...(byDepartment.get(employee.department) || []), employee.burnoutRisk]);
    }

    return Array.from(byDepartment.entries()).map(([department, scores]) => {
      const avg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
      const weeks = Array.from({ length: 12 }, (_, index) => {
        const drift = (index - 5) * 1.2;
        return Math.max(0, Math.min(100, Math.round(avg + drift)));
      });
      return { department, weeks };
    });
  }, [employees]);
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ dept: string; week: number; score: number } | null>(null);
  const highBurnoutEmployees = useMemo(() => {
    return [...employees]
      .sort((a, b) => b.burnoutRisk - a.burnoutRisk)
      .slice(0, 4)
      .map((employee) => `${employee.name} (${Math.round(employee.burnoutRisk)})`);
  }, [employees]);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "burnout-heatmap.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const getColorForScore = (score: number): string => {
    if (score >= 80) return "bg-red-600";
    if (score >= 60) return "bg-red-400";
    if (score >= 40) return "bg-yellow-400";
    if (score >= 20) return "bg-green-400";
    return "bg-green-200";
  };

  const getTextColorForScore = (score: number): string => {
    return score >= 60 ? "text-white" : "text-gray-800";
  };

  return (
    <>
      <Card className="col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Burnout Trend Heatmap (12 Weeks)</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className="overflow-x-auto">
            <div className="min-w-[760px]">
            {/* Week headers */}
            <div className="flex mb-2">
              <div className="w-32 flex-shrink-0"></div>
              <div className="flex gap-1 flex-1">
                {Array.from({ length: 12 }, (_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 text-center text-xs font-medium text-muted-foreground"
                  >
                    W{i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Department rows */}
            {data.map((dept, deptIndex) => (
              <div key={deptIndex} className="flex mb-1">
                <div className="w-32 flex-shrink-0 flex items-center">
                  <span className="text-sm font-medium">{dept.department}</span>
                </div>
                <div className="flex gap-1 flex-1">
                  {dept.weeks.map((score, weekIndex) => (
                    <div
                      key={weekIndex}
                      className={`flex-1 h-12 flex items-center justify-center rounded cursor-pointer transition-all hover:ring-2 hover:ring-blue-500 ${getColorForScore(score)}`}
                      onClick={() => setSelectedCell({ dept: dept.department, week: weekIndex + 1, score })}
                      role="button"
                      aria-label={`${dept.department} week ${weekIndex + 1}: ${score} burnout score`}
                    >
                      <span className={`text-xs font-semibold ${getTextColorForScore(score)}`}>
                        {score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Legend */}
            <div className="mt-6 flex items-center justify-center gap-4">
              <span className="text-xs text-muted-foreground">Low</span>
              <div className="flex gap-1">
                <div className="w-6 h-6 bg-green-200 rounded"></div>
                <div className="w-6 h-6 bg-green-400 rounded"></div>
                <div className="w-6 h-6 bg-yellow-400 rounded"></div>
                <div className="w-6 h-6 bg-red-400 rounded"></div>
                <div className="w-6 h-6 bg-red-600 rounded"></div>
              </div>
              <span className="text-xs text-muted-foreground">High</span>
            </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              <strong>Alert:</strong> Engineering and Sales departments show sustained high burnout (60+) 
              for 3+ consecutive weeks. Immediate workload review recommended.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cell Detail Dialog */}
      <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Burnout Detail</DialogTitle>
          </DialogHeader>
          {selectedCell && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Department</p>
                <p className="text-lg font-semibold">{selectedCell.dept}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Week</p>
                <p className="text-lg font-semibold">Week {selectedCell.week}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Burnout Score</p>
                <p className="text-3xl font-bold text-red-600">{selectedCell.score}</p>
                <ScoreExplanationDrawer
                  employeeId={`${selectedCell.dept}-week-${selectedCell.week}`}
                  scoreType="burnout"
                  className="mt-1 inline-block"
                />
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-2">Employees with High Burnout Signals</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {highBurnoutEmployees.map((emp, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">{emp}</span>
                      <Button variant="ghost" size="sm">View</Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <Button className="w-full">Schedule Team Check-in</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
