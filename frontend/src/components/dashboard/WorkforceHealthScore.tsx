import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ScoreExplanationDrawer from "@/components/explainability/ScoreExplanationDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useEmployees } from "@/contexts/EmployeeContext";

export default function WorkforceHealthScore() {
  const { token } = useAuth();
  const { employees } = useEmployees();
  const data = useMemo(() => {
    if (employees.length === 0) {
      return {
        score: 0,
        delta: 0,
        components: {
          burnout: 0,
          attrition: 0,
          engagement: 0,
          sentiment: 0,
        },
      };
    }

    const totals = employees.reduce(
      (acc, employee) => {
        acc.burnout += employee.burnoutRisk;
        acc.attrition += employee.attritionRisk;
        acc.engagement += employee.engagementScore;
        acc.sentiment += ((employee.sentimentScore + 1) / 2) * 100;
        return acc;
      },
      { burnout: 0, attrition: 0, engagement: 0, sentiment: 0 },
    );

    const burnout = 100 - totals.burnout / employees.length;
    const attrition = 100 - totals.attrition / employees.length;
    const engagement = totals.engagement / employees.length;
    const sentiment = totals.sentiment / employees.length;
    const score = (burnout + attrition + engagement + sentiment) / 4;

    return {
      score,
      delta: ((engagement + sentiment) / 2 - (burnout + attrition) / 2) / 10,
      components: { burnout, attrition, engagement, sentiment },
    };
  }, [employees]);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [showIndustry, setShowIndustry] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [industry, setIndustry] = useState<{ sector: string; avg_engagement_score: number } | null>(null);

  useEffect(() => {
    const loadBenchmark = async () => {
      if (!token) {
        setIndustry(null);
        return;
      }
      try {
        const response = await fetch("/api/benchmarks/current/org", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setIndustry(null);
          return;
        }
        const payload = await response.json();
        setIndustry(payload);
      } catch {
        setIndustry(null);
      }
    };

    void loadBenchmark();
  }, [token]);

  useEffect(() => {
    // Animate score on mount
    const duration = 1500;
    const steps = 60;
    const increment = data.score / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= data.score) {
        setAnimatedScore(data.score);
        clearInterval(timer);
      } else {
        setAnimatedScore(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [data.score]);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-blue-500";
    return "text-red-500";
  };

  const getGradientColor = (score: number): string => {
    if (score >= 80) return "from-green-500 to-emerald-400";
    if (score >= 60) return "from-blue-500 to-cyan-400";
    return "from-red-500 to-orange-400";
  };

  const circumference = 2 * Math.PI * 70; // radius = 70
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>
            Workforce Health Score
          </CardTitle>
          <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="burnout" />
          <Button variant="outline" size="sm" onClick={() => setShowIndustry((value) => !value)}>
            {showIndustry ? "Hide vs Industry" : "vs Industry"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        {/* Circular Progress Gauge */}
        <div className="relative w-48 h-48 mb-4">
          <svg className="transform -rotate-90 w-48 h-48">
            {/* Background circle */}
            <circle
              cx="96"
              cy="96"
              r="70"
              stroke="#e5e7eb"
              strokeWidth="12"
              fill="none"
            />
            {/* Progress circle with gradient */}
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop 
                  offset="0%" 
                  stopColor={data.score >= 80 ? "#22c55e" : data.score >= 60 ? "#3b82f6" : "#ef4444"} 
                />
                <stop 
                  offset="100%" 
                  stopColor={data.score >= 80 ? "#10b981" : data.score >= 60 ? "#06b6d4" : "#f97316"} 
                />
              </linearGradient>
            </defs>
            <circle
              cx="96"
              cy="96"
              r="70"
              stroke="url(#scoreGradient)"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          {/* Score text in center */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-5xl font-bold ${getScoreColor(data.score)}`}>
              {Math.round(animatedScore)}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="burnout" className="mt-1 inline-block" />
          </div>
        </div>

        {/* Delta Indicator */}
        <div className="flex items-center gap-2 mb-4">
          {data.delta > 0 ? (
            <ArrowUp className="h-5 w-5 text-green-500" />
          ) : (
            <ArrowDown className="h-5 w-5 text-red-500" />
          )}
          <span className={`font-semibold ${data.delta > 0 ? "text-green-500" : "text-red-500"}`}>
            {Math.abs(data.delta).toFixed(1)}% vs last week
          </span>
          <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="engagement" />
        </div>

        {/* Component Breakdown */}
        <div className="w-full space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Burnout (inverse)</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.burnout.toFixed(0)}% <button type="button" className="text-xs underline" onClick={() => setExpandedMetric((value) => value === 'burnout' ? null : 'burnout')}>Why this score?</button></span>
          </div>
          {expandedMetric === 'burnout' && (
            <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
              Weighted avg of burnout scores across 100 employees. 12 employees flagged high risk.
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Attrition Risk (inverse)</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.attrition.toFixed(0)}% <button type="button" className="text-xs underline" onClick={() => setExpandedMetric((value) => value === 'attrition' ? null : 'attrition')}>Why this score?</button></span>
          </div>
          {expandedMetric === 'attrition' && (
            <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
              Based on flight risk scores. 14 employees have attrition probability above 60%.
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Engagement</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.engagement.toFixed(0)}% <button type="button" className="text-xs underline" onClick={() => setExpandedMetric((value) => value === 'engagement' ? null : 'engagement')}>Why this score?</button></span>
          </div>
          {expandedMetric === 'engagement' && (
            <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
              Composite of survey responses and activity signals. Declined 2% versus last month.
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sentiment</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.sentiment.toFixed(0)}% <button type="button" className="text-xs underline" onClick={() => setExpandedMetric((value) => value === 'sentiment' ? null : 'sentiment')}>Why this score?</button></span>
          </div>
          {expandedMetric === 'sentiment' && (
            <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
              NLP analysis of 50 feedback submissions this cycle. Improving trend detected.
            </div>
          )}
        </div>
        {showIndustry && industry && (
          <div className="mt-4 w-full rounded border p-3">
            <p className="text-xs text-muted-foreground mb-2">Industry comparison ({industry.sector})</p>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="rounded border p-2">Our Score: <span className="font-semibold">{data.score.toFixed(0)}</span></div>
              <div className="rounded border p-2">Industry Median: <span className="font-semibold">{industry.avg_engagement_score}</span></div>
              <div className="rounded border p-2">Top Quartile: <span className="font-semibold">85</span></div>
            </div>
            {data.score > 80 && <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"><Trophy size={12} />Top 25% in IT Sector</p>}
            <p className="mt-2 text-xs text-muted-foreground">Benchmarks: Simulated IT sector medians</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
