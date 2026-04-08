import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, Share2, TrendingUp, TrendingDown, AlertTriangle, Sparkles } from "lucide-react";
import AnomalyIndicator from "@/components/anomalies/AnomalyIndicator";
import InterventionRecommendations from "@/components/interventions/InterventionRecommendations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { useInterventionInsights } from "@/hooks/useInterventionInsights";

export default function OrgHealthPage() {
  const { token, hasRole } = useAuth();
  const { employees } = useEmployees();
  const [anonymizeEmployees, setAnonymizeEmployees] = useState(false);
  const healthScore = calculateWorkforceHealthScore();
  const managers = generateManagerScores();
  const attrition = generateAttritionForecast();
  const tenure = generateTenureDistribution();
  const absenteeism = generateAbsenteeismData();
  const skills = generateSkillsData();

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

  const handleExport = async () => {
    const element = document.getElementById('org-health-report');
    if (element) {
      const canvas = await html2canvas(element, { scale: 2 });
      const link = document.createElement("a");
      link.download = `org-health-report-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const handlePrint = () => {
    window.print();
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

  // Top 5 at-risk employees (mock data)
  const atRiskEmployees = [
    { id: 1, name: 'Alice Johnson', department: 'Engineering', riskScore: 87, reason: 'High burnout + salary below market' },
    { id: 2, name: 'Bob Smith', department: 'Sales', riskScore: 82, reason: 'Low sentiment + missed promotion' },
    { id: 3, name: 'Carol Davis', department: 'Marketing', riskScore: 79, reason: 'Increased absenteeism + disengagement' },
    { id: 4, name: 'David Lee', department: 'Engineering', riskScore: 76, reason: 'Peer isolation + workload stress' },
    { id: 5, name: 'Emma Wilson', department: 'Sales', riskScore: 74, reason: 'Manager conflict + low recognition' },
  ];

  // Recommended interventions
  const interventions = [
    {
      intervention: 'Compensation Review Program',
      targetGroup: '23 employees below market rate',
      estimatedCost: '$285,000',
      potentialSavings: '$420,000',
      roi: '147%',
      priority: 'High',
    },
    {
      intervention: 'Manager Leadership Training',
      targetGroup: '5 managers with low team scores',
      estimatedCost: '$45,000',
      potentialSavings: '$180,000',
      roi: '400%',
      priority: 'High',
    },
    {
      intervention: 'Workload Rebalancing Initiative',
      targetGroup: 'Engineering & Sales teams',
      estimatedCost: '$120,000',
      potentialSavings: '$340,000',
      roi: '283%',
      priority: 'Critical',
    },
    {
      intervention: 'Career Development Program',
      targetGroup: '45 employees due for advancement',
      estimatedCost: '$95,000',
      potentialSavings: '$270,000',
      roi: '284%',
      priority: 'Medium',
    },
    {
      intervention: 'Enhanced Recognition System',
      targetGroup: 'Organization-wide',
      estimatedCost: '$30,000',
      potentialSavings: '$150,000',
      roi: '500%',
      priority: 'Medium',
    },
  ];

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <div className="h-4 w-4 text-gray-600">→</div>;
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Critical': return <Badge variant="destructive">{priority}</Badge>;
      case 'High': return <Badge className="bg-orange-500">{priority}</Badge>;
      case 'Medium': return <Badge variant="secondary">{priority}</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
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
          <h1 className="text-3xl font-bold">Organization Health Report</h1>
          <p className="text-muted-foreground mt-1">
            Generated on {new Date().toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      <div id="org-health-report" className="space-y-6">
        {/* Summary Scorecard */}
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary Scorecard</CardTitle>
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
              {atRiskEmployees.map((emp, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Badge variant="destructive" className="w-8 justify-center">
                        #{i + 1}
                      </Badge>
                      <div>
                        <p className="font-semibold">
                          {anonymizeEmployees ? `Employee ${emp.id}` : emp.name}
                        </p>
                        <p className="text-sm text-muted-foreground">{emp.department}</p>
                      </div>
                    </div>
                    <p className="text-sm text-red-700 mt-2 ml-11">{emp.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-red-600">{emp.riskScore}</p>
                    <p className="text-xs text-muted-foreground">Risk Score</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommended Interventions */}
        <Card>
          <CardHeader>
            <CardTitle>Recommended HR Interventions (ROI-Ranked)</CardTitle>
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
                    <TableCell>{getPriorityBadge(item.priority)}</TableCell>
                    <TableCell className="font-medium">{item.intervention}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.targetGroup}</TableCell>
                    <TableCell className="text-right">{item.estimatedCost}</TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      {item.potentialSavings}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-green-600">{item.roi}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-800">
                Total Investment: $575,000 | Projected Savings: $1,360,000 | Net ROI: 237%
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Month-over-Month Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Month-over-Month Change Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm font-semibold text-green-800 mb-2">✅ Improvements</p>
                  <ul className="text-sm space-y-1 text-green-700">
                    <li>• Operations sentiment up 4.2%</li>
                    <li>• Engineering performance up 3.1%</li>
                    <li>• Overall tenure increased to 3.1 years</li>
                    <li>• 12 employees promoted</li>
                  </ul>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm font-semibold text-red-800 mb-2">⚠️ Concerns</p>
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
      </div>
    </div>
  );
}
