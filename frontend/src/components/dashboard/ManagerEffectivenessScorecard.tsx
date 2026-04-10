import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { generateManagerScores, ManagerScore } from "@/utils/mockAnalyticsData";
import html2canvas from "html2canvas";
import { useRef, useState, Fragment } from "react";
import { LineChart, Line, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import ScoreExplanationDrawer from "@/components/explainability/ScoreExplanationDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export default function ManagerEffectivenessScorecard() {
  const { token } = useAuth();
  const data = generateManagerScores();
  const chartRef = useRef<HTMLDivElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: keyof ManagerScore; direction: 'asc' | 'desc' } | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('mgr-0');
  const [scores360, setScores360] = useState<any>(null);

  useEffect(() => {
    const load360 = async () => {
      if (!token || !selectedManagerId) {
        setScores360(null);
        return;
      }
      try {
        const response = await fetch(`/api/managers/${selectedManagerId}/360-scores`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setScores360(null);
          return;
        }
        setScores360(await response.json());
      } catch {
        setScores360(null);
      }
    };

    void load360();
  }, [selectedManagerId, token]);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "manager-effectiveness.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const toggleRow = (managerId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(managerId)) {
      newExpanded.delete(managerId);
    } else {
      newExpanded.add(managerId);
    }
    setExpandedRows(newExpanded);
  };

  const handleSort = (key: keyof ManagerScore) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    return 0;
  });

  const getTrafficLight = (value: number, metric: string): { color: string; label: string } => {
    if (metric === 'turnoverRate') {
      if (value <= 10) return { color: 'bg-green-500', label: 'Good' };
      if (value <= 20) return { color: 'bg-yellow-500', label: 'Warning' };
      return { color: 'bg-red-500', label: 'Critical' };
    }
    
    // For performance, sentiment, eNPS
    if (value >= 75) return { color: 'bg-green-500', label: 'Excellent' };
    if (value >= 50) return { color: 'bg-yellow-500', label: 'Good' };
    return { color: 'bg-red-500', label: 'Needs Attention' };
  };

  const MiniSparkline = ({ data }: { data: number[] }) => {
    const chartData = data.map((value, index) => ({ index, value }));
    
    return (
      <ResponsiveContainer width={80} height={30}>
        <LineChart data={chartData}>
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>Manager Effectiveness Scorecard</CardTitle>
          <ScoreExplanationDrawer employeeId="org-manager-scorecard" scoreType="engagement" />
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="core" className="space-y-4">
          <TabsList>
            <TabsTrigger value="core">Core Metrics</TabsTrigger>
            <TabsTrigger value="feedback360">360° Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="space-y-4">
        <div ref={chartRef} className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('managerName')}
                >
                  Manager
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('teamSize')}
                >
                  Team Size
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('avgPerformance')}
                >
                  Avg Performance
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('avgSentiment')}
                >
                  Avg Sentiment
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('turnoverRate')}
                >
                  Turnover Rate
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('enpsScore')}
                >
                  eNPS
                </TableHead>
                <TableHead className="text-center">30-Day Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((manager) => (
                <Fragment key={manager.managerId}>
                  <TableRow className="hover:bg-gray-50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          toggleRow(manager.managerId);
                          setSelectedManagerId(manager.managerId);
                        }}
                      >
                        {expandedRows.has(manager.managerId) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{manager.managerName}</TableCell>
                    <TableCell className="text-center">{manager.teamSize}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div 
                          className={`w-3 h-3 rounded-full ${getTrafficLight(manager.avgPerformance, 'performance').color}`}
                          title={getTrafficLight(manager.avgPerformance, 'performance').label}
                        />
                        <span>{manager.avgPerformance.toFixed(0)}%</span>
                        <ScoreExplanationDrawer employeeId={manager.managerId} scoreType="burnout" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div 
                          className={`w-3 h-3 rounded-full ${getTrafficLight(manager.avgSentiment, 'sentiment').color}`}
                          title={getTrafficLight(manager.avgSentiment, 'sentiment').label}
                        />
                        <span>{manager.avgSentiment.toFixed(0)}%</span>
                        <ScoreExplanationDrawer employeeId={manager.managerId} scoreType="engagement" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div 
                          className={`w-3 h-3 rounded-full ${getTrafficLight(manager.turnoverRate, 'turnoverRate').color}`}
                          title={getTrafficLight(manager.turnoverRate, 'turnoverRate').label}
                        />
                        <span>{manager.turnoverRate.toFixed(1)}%</span>
                        <ScoreExplanationDrawer employeeId={manager.managerId} scoreType="attrition" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-2">
                        <Badge 
                          variant={manager.enpsScore >= 30 ? 'default' : manager.enpsScore >= 0 ? 'secondary' : 'destructive'}
                        >
                          {manager.enpsScore.toFixed(0)}
                        </Badge>
                        <ScoreExplanationDrawer employeeId={manager.managerId} scoreType="engagement" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <MiniSparkline data={manager.trend} />
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded row showing direct reports */}
                  {expandedRows.has(manager.managerId) && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-gray-50">
                        <div className="p-4">
                          <p className="text-sm font-semibold mb-2">Direct Reports ({manager.directReports?.length || 0})</p>
                          <div className="grid grid-cols-3 gap-2">
                            {manager.directReports?.map((report, i) => (
                              <div key={i} className="text-sm p-2 bg-white rounded border">
                                {report}
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {sortedData.filter(m => getTrafficLight(m.avgPerformance, 'performance').color === 'bg-green-500').length}
            </p>
            <ScoreExplanationDrawer employeeId="org-manager-summary" scoreType="burnout" className="inline-block" />
            <p className="text-xs text-muted-foreground">High Performing Teams</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">
              {sortedData.filter(m => getTrafficLight(m.turnoverRate, 'turnoverRate').color === 'bg-yellow-500').length}
            </p>
            <ScoreExplanationDrawer employeeId="org-manager-summary" scoreType="attrition" className="inline-block" />
            <p className="text-xs text-muted-foreground">Teams at Risk</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {(sortedData.reduce((sum, m) => sum + m.enpsScore, 0) / sortedData.length).toFixed(0)}
            </p>
            <ScoreExplanationDrawer employeeId="org-manager-summary" scoreType="engagement" className="inline-block" />
            <p className="text-xs text-muted-foreground">Avg eNPS Score</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {sortedData.reduce((sum, m) => sum + m.teamSize, 0)}
            </p>
            <ScoreExplanationDrawer employeeId="org-manager-summary" scoreType="engagement" className="inline-block" />
            <p className="text-xs text-muted-foreground">Total Team Members</p>
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>Coaching Recommended:</strong> {sortedData.filter(m => 
              m.avgPerformance < 60 || m.avgSentiment < 60 || m.turnoverRate > 15
            ).length} managers would benefit from leadership development programs based on current metrics.
          </p>
        </div>
          </TabsContent>

          <TabsContent value="feedback360" className="space-y-4">
            <p className="text-xs text-muted-foreground">Powered by anonymous peer feedback</p>
            {scores360 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded border p-4">
                  <p className="text-sm font-semibold mb-2">Dimension Radar</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart
                      data={Object.entries(scores360.dimensions || {}).map(([key, value]) => ({
                        dimension: key.replace(/_/g, ' '),
                        score: Number(value),
                      }))}
                    >
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 5]} />
                      <Radar dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded border p-4 space-y-3">
                  <p className="text-sm"><strong>Overall score:</strong> {scores360.overall_score}</p>
                  <p className="text-sm"><strong>Improvement suggestion:</strong> {scores360.suggestion}</p>
                  <div className="space-y-1">
                    {(scores360.trend_last_3_cycles || []).map((cycle: any) => (
                      <p key={cycle.cycle} className="text-xs text-muted-foreground">
                        {cycle.cycle}: {cycle.score}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">360° feedback data unavailable.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
