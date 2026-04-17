import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from "recharts";
import html2canvas from "html2canvas";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi } from "@/lib/api";

type SkillsGapPayload = {
  top_skill_gaps: Array<{ skill: string; missing_count: number }>;
};

export default function SkillsGapRadar() {
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const { token } = useAuth();
  const [gapData, setGapData] = useState<Array<{ skill: string; missing_count: number }>>([]);
  const data = useMemo(() => {
    const source = gapData.length
      ? gapData
      : [
          { skill: 'Python', missing_count: 3 },
          { skill: 'React', missing_count: 2 },
          { skill: 'SQL', missing_count: 4 },
          { skill: 'Leadership', missing_count: 2 },
          { skill: 'Communication', missing_count: 3 },
        ];

    return source.slice(0, 6).map((item) => {
      const required = Math.min(100, Math.max(45, item.missing_count * 12 + 50));
      const current = Math.max(20, required - item.missing_count * 10);
      return {
        skill: item.skill,
        required,
        current,
      };
    });
  }, [gapData]);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setGapData([]);
        return;
      }
      try {
        const payload = await protectedGetApi<SkillsGapPayload>("/api/task-assignments/skills-gap-summary", token);
        setGapData(payload.top_skill_gaps || []);
      } catch {
        setGapData([]);
      }
    };

    void load();
  }, [token, selectedDept]);

  const handleExport = async () => {
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current);
      const link = document.createElement("a");
      link.download = "skills-gap-radar.png";
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const calculateAverageGap = () => {
    const gaps = data.map(d => d.required - d.current);
    return (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.skill}</p>
          <p className="text-sm text-blue-600">Current: {payload[0].value}%</p>
          <p className="text-sm text-red-600">Required: {payload[1].value}%</p>
          <p className="text-sm text-amber-600 font-semibold mt-1">
            Gap: {payload[1].value - payload[0].value} points
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Skills Gap Analysis</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="Engineering">Engineering</SelectItem>
              <SelectItem value="Sales">Sales</SelectItem>
              <SelectItem value="Marketing">Marketing</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartRef}>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={data}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis 
                dataKey="skill" 
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '12px' }}
                iconType="circle"
              />
              
              {/* Current Level - Green polygon */}
              <Radar
                name="Current Average"
                dataKey="current"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              
              {/* Required Level - Red polygon */}
              <Radar
                name="Role Requirement"
                dataKey="required"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.15}
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Skills Gap Summary */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{calculateAverageGap()}</p>
            <p className="text-xs text-muted-foreground">Avg Gap (points)</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {data.filter(d => d.current >= d.required).length}
            </p>
            <p className="text-xs text-muted-foreground">Skills Met</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              {data.filter(d => d.current < d.required).length}
            </p>
            <p className="text-xs text-muted-foreground">Skills Below Target</p>
          </div>
        </div>

        {/* Top Priority Skills */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm font-semibold text-blue-900 mb-2">Training Priorities</p>
          <div className="space-y-1">
            {data
              .filter(d => d.current < d.required)
              .sort((a, b) => (b.required - b.current) - (a.required - a.current))
              .slice(0, 3)
              .map((skill, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-blue-800">{skill.skill}</span>
                  <span className="text-blue-600 font-medium">
                    {skill.required - skill.current} points needed
                  </span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
