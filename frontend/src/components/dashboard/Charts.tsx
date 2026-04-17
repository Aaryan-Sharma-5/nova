import { useEmployees } from '@/contexts/EmployeeContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis } from 'recharts';
import { getSentimentLabel } from '@/utils/sentimentAnalysis';
import { Department, DepartmentRisk, getRiskLevel } from '@/types/employee';
import { motion } from 'framer-motion';

const SENTIMENT_COLORS = {
  Positive: '#00C853',
  Neutral: '#4ECDC4',
  Negative: '#FF1744',
};

export function SentimentPieChart() {
  const { employees } = useEmployees();

  const distribution = employees.reduce((acc, e) => {
    const label = getSentimentLabel(e.sentimentScore);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const data = Object.entries(distribution).map(([name, value]) => ({ name, value }));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="chart-container"
    >
      <h3 className="mb-4 text-sm font-bold font-heading text-foreground uppercase tracking-wider">Sentiment Distribution</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={4}
            dataKey="value"
            stroke="#000000"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name as keyof typeof SENTIMENT_COLORS]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ border: '2px solid #000', boxShadow: '4px 4px 0px #000', backgroundColor: '#FFFFFF', borderRadius: 0 }}
            formatter={(value: number) => [`${value} employees`, '']}
          />
          <Legend verticalAlign="bottom" iconType="square" iconSize={10} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function PerformanceScatterPlot() {
  const { employees } = useEmployees();

  const data = employees.map(e => ({
    name: e.name,
    performance: e.performanceScore,
    engagement: e.engagementScore,
    risk: e.burnoutRisk,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="chart-container"
    >
      <h3 className="mb-4 text-sm font-bold font-heading text-foreground uppercase tracking-wider">Performance vs Engagement</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#000000" strokeOpacity={0.15} />
          <XAxis dataKey="performance" name="Performance" type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#1A1A1A" />
          <YAxis dataKey="engagement" name="Engagement" type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#1A1A1A" />
          <ZAxis dataKey="risk" range={[30, 200]} name="Burnout Risk" />
          <Tooltip
            contentStyle={{ border: '2px solid #000', boxShadow: '4px 4px 0px #000', backgroundColor: '#FFFFFF', borderRadius: 0 }}
            formatter={(value: number, name: string) => [value, name]}
            labelFormatter={() => ''}
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Scatter data={data} fill="#4ECDC4" stroke="#000000" strokeWidth={1} fillOpacity={0.8} />
        </ScatterChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function DepartmentRiskHeatmap() {
  const { employees } = useEmployees();

  const deptMap = new Map<Department, { burnout: number[]; attrition: number[]; sentiment: number[] }>();
  for (const e of employees) {
    if (!deptMap.has(e.department)) deptMap.set(e.department, { burnout: [], attrition: [], sentiment: [] });
    const d = deptMap.get(e.department)!;
    d.burnout.push(e.burnoutRisk);
    d.attrition.push(e.attritionRisk);
    d.sentiment.push(e.sentimentScore);
  }

  const deptRisks: DepartmentRisk[] = Array.from(deptMap.entries()).map(([dept, data]) => ({
    department: dept,
    avgBurnoutRisk: Math.round(data.burnout.reduce((a, b) => a + b, 0) / data.burnout.length),
    avgAttritionRisk: Math.round(data.attrition.reduce((a, b) => a + b, 0) / data.attrition.length),
    avgSentiment: Math.round((data.sentiment.reduce((a, b) => a + b, 0) / data.sentiment.length) * 100) / 100,
    employeeCount: data.burnout.length,
  }));

  const getRiskBg = (value: number) => {
    const level = getRiskLevel(value);
    if (level === 'low') return 'bg-[#00C853] text-[#1A1A1A] border-2 border-foreground';
    if (level === 'medium') return 'bg-[#FFB300] text-[#1A1A1A] border-2 border-foreground';
    return 'bg-[#FF1744] text-white border-2 border-foreground';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.4 }}
      className="chart-container"
    >
      <h3 className="mb-4 text-sm font-bold font-heading text-foreground uppercase tracking-wider">Department Risk Heatmap</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-2 border-foreground">
          <thead>
            <tr className="text-left text-xs bg-primary text-primary-foreground uppercase tracking-wider">
              <th className="pb-2 pt-2 pr-3 pl-3 font-bold">Department</th>
              <th className="pb-2 pt-2 px-2 font-bold text-center">Count</th>
              <th className="pb-2 pt-2 px-2 font-bold text-center">Burnout</th>
              <th className="pb-2 pt-2 px-2 font-bold text-center">Attrition</th>
              <th className="pb-2 pt-2 pl-2 pr-3 font-bold text-center">Sentiment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground">
            {deptRisks.sort((a, b) => b.avgBurnoutRisk - a.avgBurnoutRisk).map(dept => (
              <tr key={dept.department} className="group hover:bg-background">
                <td className="py-2 pr-3 pl-3 font-semibold">{dept.department}</td>
                <td className="py-2 px-2 text-center tabular-nums text-muted-foreground">{dept.employeeCount}</td>
                <td className="py-2 px-2 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs font-bold tabular-nums ${getRiskBg(dept.avgBurnoutRisk)}`}>
                    {dept.avgBurnoutRisk}%
                  </span>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs font-bold tabular-nums ${getRiskBg(dept.avgAttritionRisk)}`}>
                    {dept.avgAttritionRisk}%
                  </span>
                </td>
                <td className="py-2 pl-2 pr-3 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs font-bold tabular-nums ${
                    dept.avgSentiment > 0.15 ? 'bg-[#00C853] text-[#1A1A1A] border-2 border-foreground' :
                    dept.avgSentiment < -0.15 ? 'bg-[#FF1744] text-white border-2 border-foreground' :
                    'bg-muted text-foreground border-2 border-foreground'
                  }`}>
                    {dept.avgSentiment > 0 ? '+' : ''}{dept.avgSentiment.toFixed(2)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
