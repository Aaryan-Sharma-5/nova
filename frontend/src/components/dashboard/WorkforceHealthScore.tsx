import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";
import { calculateWorkforceHealthScore } from "@/utils/mockAnalyticsData";
import { useEffect, useState } from "react";
import ScoreExplanationDrawer from "@/components/explainability/ScoreExplanationDrawer";

export default function WorkforceHealthScore() {
  const [data, setData] = useState(calculateWorkforceHealthScore());
  const [animatedScore, setAnimatedScore] = useState(0);

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
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getGradientColor = (score: number): string => {
    if (score >= 80) return "from-green-500 to-emerald-400";
    if (score >= 60) return "from-yellow-500 to-amber-400";
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
                  stopColor={data.score >= 80 ? "#22c55e" : data.score >= 60 ? "#eab308" : "#ef4444"} 
                />
                <stop 
                  offset="100%" 
                  stopColor={data.score >= 80 ? "#10b981" : data.score >= 60 ? "#f59e0b" : "#f97316"} 
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
            <span className="font-medium inline-flex items-center gap-2">{data.components.burnout.toFixed(0)}% <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="burnout" /></span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Attrition Risk (inverse)</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.attrition.toFixed(0)}% <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="attrition" /></span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Engagement</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.engagement.toFixed(0)}% <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="engagement" /></span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sentiment</span>
            <span className="font-medium inline-flex items-center gap-2">{data.components.sentiment.toFixed(0)}% <ScoreExplanationDrawer employeeId="org-workforce-health" scoreType="engagement" /></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
