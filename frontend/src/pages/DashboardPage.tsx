import { MetricsCards } from '@/components/dashboard/MetricsCards';
import { SentimentPieChart, PerformanceScatterPlot, DepartmentRiskHeatmap } from '@/components/dashboard/Charts';
import WorkforceHealthScore from '@/components/dashboard/WorkforceHealthScore';
import AttritionPredictionTimeline from '@/components/dashboard/AttritionPredictionTimeline';
import EmployeeTenureDistribution from '@/components/dashboard/EmployeeTenureDistribution';
import EngagementPerformanceQuadrant from '@/components/dashboard/EngagementPerformanceQuadrant';
import BurnoutHeatmap from '@/components/dashboard/BurnoutHeatmap';
import BurnoutPropagationMap from '@/components/dashboard/BurnoutPropagationMap';
import SkillsGapRadar from '@/components/dashboard/SkillsGapRadar';
import CompensationEquityAnalysis from '@/components/dashboard/CompensationEquityAnalysis';
import HiringFunnel from '@/components/dashboard/HiringFunnel';
import AbsenteeismPatterns from '@/components/dashboard/AbsenteeismPatterns';
import ManagerEffectivenessScorecard from '@/components/dashboard/ManagerEffectivenessScorecard';
import InterventionRecommendations, {
  InterventionRecommendation,
} from '@/components/interventions/InterventionRecommendations';
import AnomalyIndicator, { AnomalyData } from '@/components/anomalies/AnomalyIndicator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, BarChart3, TrendingDown, ShieldCheck, Clock } from 'lucide-react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useInterventionInsights } from '@/hooks/useInterventionInsights';

const KPI_DATA = [
  { icon: TrendingDown, label: 'Projected Attrition Reduction', value: '25%', desc: 'With AI-driven interventions', color: '#4ECDC4' },
  { icon: ShieldCheck, label: 'Early Detection Rate', value: '87%', desc: 'Employees flagged before exit', color: '#00C853' },
  { icon: BarChart3, label: 'Productivity Gain', value: '18%', desc: 'From wellbeing interventions', color: '#FFE500' },
  { icon: Clock, label: 'HR Time Saved', value: '15hrs/wk', desc: 'Automated analysis vs manual', color: '#FF6B9D' },
];

export default function DashboardPage() {
  const { employees } = useEmployees();
  const { token, hasRole } = useAuth();

  const canViewAnomalyBar = hasRole(['hr', 'leadership']);
  const canViewInterventions = hasRole(['hr', 'leadership', 'manager']);

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
      includeAnomalies: canViewAnomalyBar || canViewInterventions,
      includeRecommendations: canViewInterventions,
    });

  return (
    <div className="space-y-6">
      {/* Top KPI - Workforce Health Score */}
      <WorkforceHealthScore />

      {canViewAnomalyBar && (
        <Card className="border-orange-300 bg-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              Anomaly Alert Bar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AnomalyIndicator
              compact
              isLoading={anomalyLoading}
              emptyStateMessage="No anomaly data available right now."
              sentiment={anomalyData?.sentiment}
              engagement={anomalyData?.engagement}
              performance={anomalyData?.performance}
              communication={anomalyData?.communication}
              composite={anomalyData?.composite}
            />
          </CardContent>
        </Card>
      )}

      {/* Original Metrics Cards */}
      <MetricsCards />

      {/* Attrition Prediction Timeline */}
      <div className="grid gap-4 lg:grid-cols-1">
        <AttritionPredictionTimeline />
      </div>

      {/* Employee Tenure Distribution */}
      <div className="grid gap-4 lg:grid-cols-1">
        <EmployeeTenureDistribution />
      </div>

      {/* Engagement vs Performance Quadrant Matrix */}
      <EngagementPerformanceQuadrant />

      {/* Original Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SentimentPieChart />
        <PerformanceScatterPlot />
      </div>

      {/* Burnout Heatmap */}
      <BurnoutHeatmap />

      {/* Burnout Propagation Graph */}
      <BurnoutPropagationMap />

      {/* Skills Gap Radar */}
      <div className="grid gap-4 lg:grid-cols-1">
        <SkillsGapRadar />
      </div>

      {/* Compensation Equity Analysis */}
      <CompensationEquityAnalysis />

      {/* Hiring Funnel */}
      <div className="grid gap-4 lg:grid-cols-1">
        <HiringFunnel />
      </div>

      {/* Absenteeism Patterns */}
      <AbsenteeismPatterns />

      {/* Manager Effectiveness Scorecard */}
      <ManagerEffectivenessScorecard />

      {/* Original Department Risk Heatmap */}
      <DepartmentRiskHeatmap />

      {canViewInterventions && featuredEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Actions</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* Business Impact KPIs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <h3 className="mb-3 text-sm font-bold font-heading text-foreground uppercase tracking-wider">Business Impact Projections</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_DATA.map((kpi, i) => (
            <div key={i} className="metric-card flex items-center gap-3 p-4">
              <div
                className="flex h-10 w-10 items-center justify-center border-2 border-foreground shadow-[2px_2px_0px_#000]"
                style={{ backgroundColor: kpi.color }}
              >
                <kpi.icon className="h-4 w-4 text-[#1A1A1A]" />
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-foreground">{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
