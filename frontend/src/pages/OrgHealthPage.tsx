import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, Share2, TrendingUp, TrendingDown, AlertTriangle, Sparkles, Info, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import AnomalyIndicator from "@/components/anomalies/AnomalyIndicator";
import InterventionRecommendations from "@/components/interventions/InterventionRecommendations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployees } from "@/contexts/EmployeeContext";
import { 
  calculateWorkforceHealthScore,
  generateManagerScores,
  generateAttritionForecast,
  generateTenureDistribution,
  generateAbsenteeismData,
  generateSkillsData,
} from "@/utils/mockAnalyticsData";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import { useInterventionInsights } from "@/hooks/useInterventionInsights";
import jsPDF from "jspdf";
import BenchmarkBadge from "@/components/dashboard/BenchmarkBadge";
import WeeklyBriefCard from "@/components/dashboard/WeeklyBriefCard";
import AttritionPredictionTimeline from "@/components/dashboard/AttritionPredictionTimeline";
import EmployeeTenureDistribution from "@/components/dashboard/EmployeeTenureDistribution";
import EngagementPerformanceQuadrant from "@/components/dashboard/EngagementPerformanceQuadrant";
import BurnoutHeatmap from "@/components/dashboard/BurnoutHeatmap";
import BurnoutPropagationMap from "@/components/dashboard/BurnoutPropagationMap";
import SkillsGapRadar from "@/components/dashboard/SkillsGapRadar";
import CompensationEquityAnalysis from "@/components/dashboard/CompensationEquityAnalysis";
import HiringFunnel from "@/components/dashboard/HiringFunnel";
import AbsenteeismPatterns from "@/components/dashboard/AbsenteeismPatterns";
import ManagerEffectivenessScorecard from "@/components/dashboard/ManagerEffectivenessScorecard";
import { SentimentPieChart, PerformanceScatterPlot, DepartmentRiskHeatmap } from "@/components/dashboard/Charts";
import { protectedGetApi } from "@/lib/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type ImpactStep = {
  name: string;
  formula: string;
  result: number;
};

type CalculationBreakdown = {
  formula?: string;
  inputs: Record<string, number | string>;
  steps: ImpactStep[];
};

type InterventionImpact = {
  intervention: string;
  target_group: string;
  estimated_cost: number;
  projected_savings: number;
  roi_percent: number;
  plain_english: string;
  calculation_breakdown: CalculationBreakdown;
};

type CostImpactPayload = {
  figures: {
    total_attrition_cost: number;
    projected_savings: number;
    productivity_gain: number;
    net_impact: number;
  };
  plain_english: string;
  calculation_breakdown: CalculationBreakdown;
  intervention_impacts: InterventionImpact[];
  methodology: {
    assumptions: string[];
    currency: string;
    version: string;
  };
};

type ROIRecommendationPayload = {
  intervention_type: string;
  intervention_name: string;
  description: string;
  urgency: "low" | "medium" | "high" | "critical";
  priority_score: number;
  target_group: string;
  target_employee_count: number;
  intervention_cost_inr: number;
  projected_savings_inr: number;
  roi_percent: number;
  savings_basis: string;
};

type ROISummaryPayload = {
  total_investment_inr: number;
  total_projected_savings_inr: number;
  net_impact_inr: number;
  intervention_count: number;
  avg_roi_percent: number;
};

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildRiskReason(
  burnoutRisk: number,
  attritionRisk: number,
  sentimentScore: number,
  engagementScore: number,
): string {
  const reasons: string[] = [];
  if (burnoutRisk >= 70) reasons.push("High burnout");
  if (attritionRisk >= 70) reasons.push("High flight risk");
  if (sentimentScore <= -0.25) reasons.push("Low sentiment");
  if (engagementScore <= 45) reasons.push("Low engagement");
  if (reasons.length === 0) reasons.push("Emerging retention risk");
  return reasons.slice(0, 2).join(" + ");
}

function ExplainableValue({
  value,
  breakdown,
  plainEnglish,
}: {
  value: string;
  breakdown: CalculationBreakdown | null;
  plainEnglish: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span>{value}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground" aria-label="Show calculation details">
            <Info className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formula</p>
          <p className="text-sm font-medium">{breakdown?.formula || breakdown?.steps?.[0]?.formula || "See steps below"}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">Inputs</p>
          <div className="text-xs space-y-1">
            {Object.entries(breakdown?.inputs || {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">Calculation Steps</p>
          <div className="text-xs space-y-1">
            {(breakdown?.steps || []).map((step) => (
              <p key={step.name}><span className="font-medium">{step.name}:</span> {step.formula} = {step.result}</p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-1">{plainEnglish}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

function formatRelativeTime(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function OrgHealthPage() {
  useDocumentTitle('NOVA — Workforce Overview');
  const navigate = useNavigate();
  const { token, hasRole, user } = useAuth();
  const { employees } = useEmployees();
  const [anonymizeEmployees, setAnonymizeEmployees] = useState(false);
  const healthScore = calculateWorkforceHealthScore();
  const [computedAt, setComputedAt] = useState<Date>(() => new Date());
  const [now, setNow] = useState<Date>(() => new Date());
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const todayLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const lastUpdatedLabel = formatRelativeTime(computedAt, now);
  const greetingName = user?.full_name?.split(' ')[0] || user?.full_name || 'there';
  const managers = generateManagerScores();
  const attrition = generateAttritionForecast();
  const tenure = generateTenureDistribution();
  const absenteeism = generateAbsenteeismData();
  const skills = generateSkillsData();
  const [impact, setImpact] = useState<CostImpactPayload | null>(null);
  const [roiRecommendations, setROIRecommendations] = useState<ROIRecommendationPayload[]>([]);
  const [roiSummary, setROISummary] = useState<ROISummaryPayload | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportStep, setReportStep] = useState("Idle");
  const [benchmark, setBenchmark] = useState<any>(null);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showDeepAnalytics, setShowDeepAnalytics] = useState(false);

  const canViewAnomalyInsights = hasRole(['hr', 'leadership']);
  const canViewInterventionInsights = hasRole(['manager', 'hr', 'leadership']);

  const featuredEmployee = useMemo(() => {
    if (employees.length === 0) {
      return undefined;
    }
    return [...employees].sort(
      (a, b) => b.attritionRisk + b.burnoutRisk - (a.attritionRisk + a.burnoutRisk),
    )[0];
  }, [employees]);

  const { anomalyLoading, interventionLoading, anomalyData, interventionsData } =
    useInterventionInsights({
      token,
      featuredEmployee,
      includeAnomalies: canViewAnomalyInsights || canViewInterventionInsights,
      includeRecommendations: canViewInterventionInsights,
    });

  useEffect(() => {
    const loadCostImpact = async () => {
      if (!token) {
        setImpact(null);
        return;
      }
      try {
        const response = await fetch('/api/insights/cost-impact', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setImpact(null);
          return;
        }
        const payload = (await response.json()) as CostImpactPayload;
        setImpact(payload);
      } catch {
        setImpact(null);
      }
    };

    void loadCostImpact();
  }, [token, refreshNonce]);

  useEffect(() => {
    const loadROI = async () => {
      if (!token) {
        setROIRecommendations([]);
        setROISummary(null);
        return;
      }
      try {
        const recommendationsPayload = await protectedGetApi<{ recommendations: ROIRecommendationPayload[] }>(
          "/api/interventions/recommendations",
          token,
        );
        setROIRecommendations(recommendationsPayload.recommendations || []);
      } catch {
        setROIRecommendations([]);
      }

      try {
        const summaryPayload = await protectedGetApi<ROISummaryPayload>("/api/interventions/roi-summary", token);
        setROISummary(summaryPayload);
      } catch {
        setROISummary(null);
      }
    };

    void loadROI();
  }, [token, refreshNonce]);

  useEffect(() => {
    const loadBenchmark = async () => {
      if (!token) {
        setBenchmark(null);
        return;
      }
      try {
        const response = await fetch('/api/benchmarks/current/org', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setBenchmark(null);
          return;
        }
        const payload = await response.json();
        setBenchmark(payload);
      } catch {
        setBenchmark(null);
      }
    };

    void loadBenchmark();
  }, [token, refreshNonce]);

  const handleExport = async () => {
    const element = document.getElementById('org-health-report');
    if (element) {
      const canvas = await html2canvas(element, { scale: 2 });
      const link = document.createElement("a");
      link.download = `org-wellbeing-report-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const handleExportPdfReport = async () => {
    if (!token) {
      return;
    }

    setIsGeneratingReport(true);
    try {
      setReportStep("Collecting report data...");
      const reportResponse = await fetch('/api/reports/org-health?format=pdf', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const report = reportResponse.ok ? await reportResponse.json() : null;

      setReportStep("Capturing dashboard snapshot...");
      const canvasTarget = document.getElementById('org-health-report');
      const captured = canvasTarget ? await html2canvas(canvasTarget, { scale: 2 }) : null;

      setReportStep("Generating PDF pages...");
      const doc = new jsPDF("p", "mm", "a4");
      const orgName = "NOVA Demo Org";
      const dateLabel = new Date().toISOString().split('T')[0];

      doc.setFontSize(22);
      doc.text("NOVA Org Wellbeing Report", 20, 30);
      doc.setFontSize(12);
      doc.text(`Organization: ${orgName}`, 20, 42);
      doc.text(`Date: ${dateLabel}`, 20, 50);
      doc.text("Confidential", 20, 58);

      doc.addPage();
      doc.setFontSize(16);
      doc.text("Executive Summary", 20, 24);
      doc.setFontSize(11);
      doc.text(doc.splitTextToSize(report?.executive_summary || "Summary unavailable.", 170), 20, 34);

      if (captured) {
        const imageData = captured.toDataURL("image/png");
        doc.addPage();
        doc.setFontSize(16);
        doc.text("Workforce Health & Burnout Overview", 20, 18);
        doc.addImage(imageData, "PNG", 10, 24, 190, 120);

        doc.addPage();
        doc.setFontSize(16);
        doc.text("Top Risks & Recommended Interventions", 20, 18);
        doc.addImage(imageData, "PNG", 10, 24, 190, 120);
      } else {
        doc.addPage();
        doc.text("Workforce Health & Burnout Overview", 20, 24);
        doc.text("Chart capture unavailable.", 20, 34);
        doc.addPage();
        doc.text("Top Risks & Recommended Interventions", 20, 24);
      }

      doc.addPage();
      doc.setFontSize(16);
      doc.text("Methodology & Data Sources", 20, 24);
      doc.setFontSize(11);
      doc.text(
        doc.splitTextToSize(
          "Data Sources: Survey, Jira, Session, System. Benchmarks are simulated industry medians for demonstration purposes.",
          170,
        ),
        20,
        34,
      );

      setReportStep("Downloading PDF...");
      doc.save(`NOVA_OrgHealth_${orgName.replace(/\s+/g, "")}_${dateLabel}.pdf`);
      setReportStep("Done");
    } finally {
      setTimeout(() => {
        setIsGeneratingReport(false);
        setReportStep("Idle");
      }, 600);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRefreshAll = () => {
    setRefreshNonce((value) => value + 1);
    const refreshed = new Date();
    setComputedAt(refreshed);
    setNow(refreshed);
  };

  // Calculate department comparison metrics
  const departmentMetrics = [
    {
      department: 'Engineering',
      headcount: 87,
      attritionRate: 9.2,
      avgPerformance: 82,
      avgSentiment: 74,
      avgTenure: 3.2,
      burnoutScore: 58,
      trend: 'up',
    },
    {
      department: 'Sales',
      headcount: 64,
      attritionRate: 14.5,
      avgPerformance: 78,
      avgSentiment: 68,
      avgTenure: 2.1,
      burnoutScore: 72,
      trend: 'down',
    },
    {
      department: 'Marketing',
      headcount: 42,
      attritionRate: 11.3,
      avgPerformance: 75,
      avgSentiment: 71,
      avgTenure: 2.8,
      burnoutScore: 54,
      trend: 'stable',
    },
    {
      department: 'Operations',
      headcount: 53,
      attritionRate: 7.8,
      avgPerformance: 80,
      avgSentiment: 76,
      avgTenure: 4.1,
      burnoutScore: 48,
      trend: 'up',
    },
  ];

  const atRiskEmployees = useMemo(() => {
    return [...employees]
      .sort((a, b) => (b.attritionRisk + b.burnoutRisk) - (a.attritionRisk + a.burnoutRisk))
      .slice(0, 5)
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        department: employee.department,
        riskScore: Math.round(Math.max(employee.attritionRisk, employee.burnoutRisk)),
        reason: buildRiskReason(
          employee.burnoutRisk,
          employee.attritionRisk,
          employee.sentimentScore,
          employee.engagementScore,
        ),
      }));
  }, [employees]);

  const criticalEmployeeCount = useMemo(
    () => employees.filter((employee) => Math.max(employee.attritionRisk, employee.burnoutRisk) >= 80).length,
    [employees],
  );
  const pendingSessionsCount = Math.max(0, Math.min(12, atRiskEmployees.length + 2));
  const flaggedDepartment = departmentMetrics
    .map((department) => ({
      name: department.department,
      efficiency: department.avgPerformance - department.burnoutScore * 0.5,
    }))
    .find((department) => department.efficiency < 50);

  const alertItems = [
    criticalEmployeeCount > 3
      ? {
          id: 'critical-employees',
          tone: 'red',
          text: `🔴 ${criticalEmployeeCount} employees require immediate intervention`,
          to: '/employees',
        }
      : null,
    flaggedDepartment
      ? {
          id: 'dept-review',
          tone: 'amber',
          text: `🟡 ${flaggedDepartment.name} is flagged for urgent review`,
          to: '/departments/heatmap',
        }
      : null,
    pendingSessionsCount > 5
      ? {
          id: 'pending-sessions',
          tone: 'amber',
          text: `📋 ${pendingSessionsCount} feedback sessions awaiting HR review`,
          to: '/hr/sessions-review',
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; tone: string; text: string; to: string }>;

  const interventions = useMemo(() => {
    return roiRecommendations.map((item, idx) => ({
      rank: idx + 1,
      intervention: item.intervention_name,
      description: item.description,
      targetGroup: item.target_group,
      employeeCount: item.target_employee_count,
      estimatedCost: item.intervention_cost_inr,
      potentialSavings: item.projected_savings_inr,
      roiPercent: item.roi_percent,
      urgency: item.urgency,
      savingsBasis: item.savings_basis,
    }));
  }, [roiRecommendations]);

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <div className="h-4 w-4 text-gray-600">→</div>;
  };

  const getPriorityBadge = (urgency: string, rank: number) => {
    if (urgency === 'critical') {
      return <Badge variant="destructive">#{rank} Critical</Badge>;
    }
    if (urgency === 'high') {
      return <Badge className="bg-amber-500">#{rank} High</Badge>;
    }
    return <Badge className="bg-green-600">#{rank} Medium</Badge>;
  };

  const getRoiClass = (roiPercent: number) => {
    if (roiPercent > 200) return 'bg-green-600';
    if (roiPercent >= 50) return 'bg-amber-500';
    return 'bg-red-600';
  };

  // Generate AI summary
  const aiSummary = `
    The organization's workforce health score stands at ${healthScore.score.toFixed(0)}/100, representing a ${
    healthScore.delta >= 0 ? 'positive' : 'negative'
    } ${Math.abs(healthScore.delta).toFixed(1)}% change from last month. Key findings indicate elevated attrition 
    risk in Sales (14.5%) and Marketing (11.3%) departments, driven primarily by burnout and compensation concerns. 
    Engineering maintains strong performance metrics (82%) but shows increasing burnout signals (58 score). 
    Operations leads in employee satisfaction and tenure stability. Critical action items include immediate 
    compensation review for 23 below-market employees and workload rebalancing for high-burnout teams. Projected 
    ROI for recommended interventions ranges from 147% to 500%, with potential cost avoidance of $1.36M annually 
    through proactive retention strategies.
  `;

  return (
    <div className="space-y-6 pb-8">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, {greetingName} 👋</h1>
          <p className="text-muted-foreground mt-1">{todayLabel}</p>
          <p className="text-sm font-semibold mt-2">Last updated: {lastUpdatedLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnonymizeEmployees(!anonymizeEmployees)}>
            {anonymizeEmployees ? 'Show Names' : 'Anonymize'}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={handleExportPdfReport} disabled={isGeneratingReport}>
            <Download className="h-4 w-4 mr-2" />
            {isGeneratingReport ? "Generating report..." : "Export Report"}
          </Button>
          <Button size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>
      {isGeneratingReport && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Generating report...</p>
            <p className="text-xs text-muted-foreground mt-1">{reportStep}</p>
          </CardContent>
        </Card>
      )}

      {alertItems.length > 0 && (
        <div className="space-y-2">
          {alertItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full text-left rounded-lg border px-4 py-2 text-sm ${item.tone === 'red' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}
              onClick={() => navigate(item.to)}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}

      <div id="org-health-report" className="space-y-6">
        <WeeklyBriefCard scope="org" />

        {/* Summary Scorecard */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Executive Summary Scorecard</CardTitle>
              <span className="text-xs text-muted-foreground">Last updated: {lastUpdatedLabel}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <p className="text-3xl font-bold text-blue-700">
                  {healthScore.score.toFixed(0)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Workforce Health</p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  {healthScore.delta >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className={`text-sm font-medium ${healthScore.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.abs(healthScore.delta).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                <p className="text-3xl font-bold text-green-700">246</p>
                <p className="text-sm text-muted-foreground mt-1">Total Headcount</p>
                <p className="text-sm text-green-600 font-medium mt-2">+8 this month</p>
              </div>

              <div className="text-center p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg">
                <p className="text-3xl font-bold text-amber-700">10.7%</p>
                <p className="text-sm text-muted-foreground mt-1">Avg Attrition Rate</p>
                <p className="text-sm text-amber-600 font-medium mt-2">vs 12% target</p>
              </div>

              <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                <p className="text-3xl font-bold text-purple-700">78.8</p>
                <p className="text-sm text-muted-foreground mt-1">Avg Performance</p>
                <p className="text-sm text-purple-600 font-medium mt-2">Above target</p>
              </div>

              <div className="text-center p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
                <p className="text-3xl font-bold text-red-700">58</p>
                <p className="text-sm text-muted-foreground mt-1">Burnout Score</p>
                <p className="text-sm text-red-600 font-medium mt-2">Needs attention</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <button type="button" onClick={() => navigate('/hr/sessions-schedule')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
                <p className="font-medium">📅 Schedule Sessions</p>
                <p className="text-xs text-muted-foreground">{pendingSessionsCount}</p>
              </button>
              <button type="button" onClick={() => navigate('/employees')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
                <p className="font-medium">👥 Review At-Risk</p>
                <p className="text-xs text-muted-foreground">{criticalEmployeeCount}</p>
              </button>
              <button type="button" onClick={() => navigate('/hr/appraisals')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
                <p className="font-medium">📊 Run Appraisals</p>
                <p className="text-xs text-muted-foreground">{Math.max(1, interventions.length)}</p>
              </button>
              <button type="button" onClick={() => navigate('/hr/feedback-analyzer')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
                <p className="font-medium">📋 Review Feedback</p>
                <p className="text-xs text-muted-foreground">50</p>
              </button>
            </div>
          </CardContent>
        </Card>

        {benchmark && (
          <Card>
            <CardHeader>
              <CardTitle>How You Compare</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <BenchmarkBadge
                  sector={benchmark.org_sector || benchmark.sector || 'Industry'}
                  score={healthScore.score}
                  topQuartileThreshold={benchmark.top_quartile_threshold || 80}
                  bottomQuartileThreshold={benchmark.bottom_quartile_threshold || 55}
                />
                <p className="text-xs text-muted-foreground">
                  Benchmarks are simulated industry medians for demonstration purposes
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-3">Burnout median: {(Number(benchmark.avg_burnout_rate || 0) * 100).toFixed(1)}%</div>
                <div className="rounded border p-3">Attrition median: {(Number(benchmark.avg_attrition_rate || 0) * 100).toFixed(1)}%</div>
                <div className="rounded border p-3">Engagement median: {Number(benchmark.avg_engagement_score || 0).toFixed(0)}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI-Generated Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Generated Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground">
              {aiSummary.trim()}
            </p>
          </CardContent>
        </Card>

        {/* Department Comparison Table */}
        <Card>
          <CardHeader>
            <CardTitle>Department Comparison Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Headcount</TableHead>
                  <TableHead className="text-center">Attrition Rate</TableHead>
                  <TableHead className="text-center">Performance</TableHead>
                  <TableHead className="text-center">Sentiment</TableHead>
                  <TableHead className="text-center">Avg Tenure (yrs)</TableHead>
                  <TableHead className="text-center">Burnout</TableHead>
                  <TableHead className="text-center">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departmentMetrics.map((dept, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{dept.department}</TableCell>
                    <TableCell className="text-center">{dept.headcount}</TableCell>
                    <TableCell className="text-center">
                      <span className={dept.attritionRate > 12 ? 'text-red-600 font-semibold' : ''}>
                        {dept.attritionRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{dept.avgPerformance}</TableCell>
                    <TableCell className="text-center">{dept.avgSentiment}</TableCell>
                    <TableCell className="text-center">{dept.avgTenure}</TableCell>
                    <TableCell className="text-center">
                      <span className={dept.burnoutScore > 60 ? 'text-red-600 font-semibold' : ''}>
                        {dept.burnoutScore}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{getTrendIcon(dept.trend)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top 5 At-Risk Employees */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Top 5 Employees at Flight Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {atRiskEmployees.map((emp, i) => {
                const rankColors = ['#b91c1c', '#dc2626', '#f97316', '#f59e0b', '#eab308'];
                const rankColor = rankColors[i] ?? rankColors[rankColors.length - 1];
                const reasonChips = emp.reason.split('+').map((item) => item.trim()).filter(Boolean);

                return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border p-4"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                    borderLeft: `4px solid ${rankColor}`,
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Badge className="w-8 justify-center" style={{ backgroundColor: rankColor, color: '#fff' }}>
                        #{i + 1}
                      </Badge>
                      <div>
                        <p className="font-semibold">
                          {anonymizeEmployees ? `Employee ${emp.id}` : emp.name}
                        </p>
                        <p className="text-sm text-muted-foreground">{emp.department}</p>
                      </div>
                    </div>
                    <div className="mt-2 ml-11 flex flex-wrap gap-1.5">
                      {reasonChips.map((chip) => (
                        <span
                          key={`${emp.id}-${chip}`}
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${rankColor} 16%, var(--bg-card))`,
                            color: 'var(--text-primary)',
                            border: `1px solid color-mix(in srgb, ${rankColor} 60%, transparent)`,
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <p className="text-3xl font-bold" style={{ color: rankColor }}>{emp.riskScore}</p>
                    <p className="text-xs text-muted-foreground">Risk Score</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/insights/${emp.id}`)}
                      className="text-xs"
                    >
                      Take Action →
                    </Button>
                  </div>
                </div>
              );
            })}
            </div>
          </CardContent>
        </Card>

        {/* Recommended Interventions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Recommended HR Interventions (ROI-Ranked)</CardTitle>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="link" className="h-auto p-0 text-sm">Methodology</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cost Impact Methodology</DialogTitle>
                    <DialogDescription>
                      Transparent assumptions used for all cost/savings figures shown in this report.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 text-sm">
                    <p>- Replacement cost estimate: 75% of salary for junior roles and 150% for senior roles.</p>
                    <p>- Attrition probability indicates modeled likelihood of voluntary exit based on risk signals.</p>
                    <p>- Data sources include burnout risk, sentiment, tenure, performance, and retention risk indicators.</p>
                    <p className="text-muted-foreground pt-2">
                      Disclaimer: Figures are projections based on risk scores. Actual savings depend on intervention outcomes.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Intervention</TableHead>
                  <TableHead>Target Group</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Savings</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interventions.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>{getPriorityBadge(item.urgency, item.rank)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{item.intervention}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.targetGroup}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <span>{formatINR(item.estimatedCost)}</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Estimated manager and HR cost details">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 text-xs">
                            Estimated manager/HR time and program cost.
                          </PopoverContent>
                        </Popover>
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <span>{formatINR(item.potentialSavings)}</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Projected savings calculation details">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 text-xs">
                            {item.savingsBasis}
                          </PopoverContent>
                        </Popover>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={getRoiClass(item.roiPercent)}>{item.roiPercent.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-800">
                Total Investment:{' '}
                <ExplainableValue
                  value={formatINR(roiSummary?.total_investment_inr || 0)}
                  breakdown={impact?.calculation_breakdown ?? null}
                  plainEnglish={impact?.plain_english || 'Transparent cost model applied'}
                />
                {' | '}Projected Savings:{' '}
                <ExplainableValue
                  value={formatINR(roiSummary?.total_projected_savings_inr || 0)}
                  breakdown={impact?.calculation_breakdown ?? null}
                  plainEnglish={impact?.plain_english || 'Transparent savings model applied'}
                />
                {' | '}Net Impact: {formatINR(roiSummary?.net_impact_inr || 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Month-over-Month Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Month-over-Month Change Summary</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowMonthlySummary((value) => !value)}>
              {showMonthlySummary ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showMonthlySummary ? "Hide" : "Show"}
            </Button>
          </CardHeader>
          {showMonthlySummary && (
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm font-semibold text-green-800 mb-2">Improvements</p>
                    <ul className="text-sm space-y-1 text-green-700">
                      <li>• Operations sentiment up 4.2%</li>
                      <li>• Engineering performance up 3.1%</li>
                      <li>• Overall tenure increased to 3.1 years</li>
                      <li>• 12 employees promoted</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm font-semibold text-red-800 mb-2">Concerns</p>
                    <ul className="text-sm space-y-1 text-red-700">
                      <li>• Sales attrition up 2.3%</li>
                      <li>• Burnout scores increased across 3 departments</li>
                      <li>• 5 high performers flagged as flight risk</li>
                      <li>• Absenteeism up 8% in Engineering</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommended Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {canViewAnomalyInsights && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Behavioral Anomalies
                </h3>
                <AnomalyIndicator
                  isLoading={anomalyLoading}
                  emptyStateMessage="No anomaly data available for this employee profile yet."
                  sentiment={anomalyData?.sentiment}
                  engagement={anomalyData?.engagement}
                  performance={anomalyData?.performance}
                  communication={anomalyData?.communication}
                  composite={anomalyData?.composite}
                />
              </div>
            )}

            {canViewInterventionInsights && featuredEmployee && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Intervention Plan
                </h3>
                <InterventionRecommendations
                  employeeId={featuredEmployee.id}
                  employeeName={featuredEmployee.name}
                  recommendations={interventionsData?.recommendations ?? []}
                  overallUrgency={interventionsData?.overallUrgency ?? 'low'}
                  reasoning={
                    interventionsData?.reasoning ??
                    'No intervention recommendations are currently available from the service.'
                  }
                  isLoading={interventionLoading}
                  currentBurnoutRisk={featuredEmployee.burnoutRisk}
                  currentAttritionRisk={featuredEmployee.attritionRisk}
                  workHoursPerWeek={featuredEmployee.workHoursPerWeek}
                  sentimentScore={featuredEmployee.sentimentScore}
                  engagementScore={featuredEmployee.engagementScore}
                  tenureMonths={featuredEmployee.tenure}
                  emptyStateMessage="No interventions were recommended for the selected employee profile."
                />
              </div>
            )}

            {!canViewAnomalyInsights && !canViewInterventionInsights && (
              <p className="text-sm text-muted-foreground">
                You do not have permission to view intervention recommendations.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Deep Analytics — charts moved off the HR dashboard live here */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-bold font-heading uppercase tracking-wider">Deep Analytics</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowDeepAnalytics((value) => !value)}>
              {showDeepAnalytics ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showDeepAnalytics ? "Hide Charts" : "Show Charts"}
            </Button>
          </CardHeader>
          {showDeepAnalytics && (
            <CardContent className="space-y-6">
              <AttritionPredictionTimeline />
              <EmployeeTenureDistribution />
              <EngagementPerformanceQuadrant />

              <div className="grid gap-4 lg:grid-cols-2">
                <SentimentPieChart />
                <PerformanceScatterPlot />
              </div>

              <BurnoutHeatmap />
              <BurnoutPropagationMap />
              <SkillsGapRadar />
              <CompensationEquityAnalysis />
              <HiringFunnel />
              <AbsenteeismPatterns />
              <ManagerEffectivenessScorecard />
              <DepartmentRiskHeatmap />
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
