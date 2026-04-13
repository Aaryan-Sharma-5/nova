import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { MetricsCards } from '@/components/dashboard/MetricsCards';
import WorkforceHealthScore from '@/components/dashboard/WorkforceHealthScore';
import WeeklyBriefCard from '@/components/dashboard/WeeklyBriefCard';
import InterventionRecommendations from '@/components/interventions/InterventionRecommendations';
import AnomalyIndicator from '@/components/anomalies/AnomalyIndicator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useInterventionInsights } from '@/hooks/useInterventionInsights';

export default function HRDashboard() {
  const { employees } = useEmployees();
  const { token } = useAuth();

  const featuredEmployee = useMemo(() => {
    if (employees.length === 0) return undefined;
    return [...employees].sort(
      (a, b) => b.attritionRisk + b.burnoutRisk - (a.attritionRisk + a.burnoutRisk),
    )[0];
  }, [employees]);

  const topAtRisk = useMemo(() => {
    return [...employees]
      .sort((a, b) => b.attritionRisk + b.burnoutRisk - (a.attritionRisk + a.burnoutRisk))
      .slice(0, 5);
  }, [employees]);

  const { anomalyLoading, interventionLoading, anomalyData, interventionsData } =
    useInterventionInsights({
      token,
      featuredEmployee,
      includeAnomalies: true,
      includeRecommendations: true,
    });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            HR Administrator
          </p>
          <h1 className="text-2xl font-bold font-heading text-foreground">Workforce Command</h1>
        </div>
        <Link
          to="/org-health"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 border-foreground bg-[#FFE500] shadow-[2px_2px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] transition-all"
        >
          Full Analytics <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkforceHealthScore />
        <WeeklyBriefCard scope="org" />
      </div>

      <MetricsCards />

      <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
        <CardHeader className="border-b-2 border-foreground pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-heading uppercase tracking-wider">
            <AlertCircle className="h-3.5 w-3.5 text-[#FF1744]" />
            Anomaly Watch
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <AnomalyIndicator
            compact
            isLoading={anomalyLoading}
            emptyStateMessage="No anomalies detected this cycle."
            employeeId={featuredEmployee?.id}
            employeeName={featuredEmployee?.name}
            sentiment={anomalyData?.sentiment}
            engagement={anomalyData?.engagement}
            performance={anomalyData?.performance}
            communication={anomalyData?.communication}
            composite={anomalyData?.composite}
          />
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
        <CardHeader className="border-b-2 border-foreground pb-3">
          <CardTitle className="text-base font-heading uppercase tracking-wider">
            Top At-Risk Employees
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {topAtRisk.map((emp) => (
              <Link
                key={emp.id}
                to={`/employees/${emp.id}/profile`}
                className="flex items-center justify-between border-2 border-foreground bg-background p-3 hover:bg-[#FFF9D6] transition-colors"
              >
                <div>
                  <p className="text-sm font-bold">{emp.name}</p>
                  <p className="text-xs text-muted-foreground">{emp.department}</p>
                </div>
                <div className="flex gap-2">
                  <span
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground"
                    style={{
                      backgroundColor:
                        emp.burnoutRisk >= 70 ? '#FF1744' : emp.burnoutRisk >= 50 ? '#FFB300' : '#00C853',
                      color: emp.burnoutRisk >= 70 ? '#fff' : '#1A1A1A',
                    }}
                  >
                    Burnout {emp.burnoutRisk}
                  </span>
                  <span
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground"
                    style={{
                      backgroundColor:
                        emp.attritionRisk >= 70 ? '#FF1744' : emp.attritionRisk >= 50 ? '#FFB300' : '#00C853',
                      color: emp.attritionRisk >= 70 ? '#fff' : '#1A1A1A',
                    }}
                  >
                    Attrition {emp.attritionRisk}
                  </span>
                </div>
              </Link>
            ))}
            {topAtRisk.length === 0 && (
              <p className="text-sm text-muted-foreground">No employees loaded.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {featuredEmployee && (
        <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
          <CardHeader className="border-b-2 border-foreground pb-3">
            <CardTitle className="text-base font-heading uppercase tracking-wider">
              Recommended Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <InterventionRecommendations
              employeeId={featuredEmployee.id}
              employeeName={featuredEmployee.name}
              recommendations={interventionsData?.recommendations ?? []}
              overallUrgency={interventionsData?.overallUrgency ?? 'low'}
              reasoning={
                interventionsData?.reasoning ??
                'No intervention recommendations are currently available.'
              }
              isLoading={interventionLoading}
              currentBurnoutRisk={featuredEmployee.burnoutRisk}
              currentAttritionRisk={featuredEmployee.attritionRisk}
              workHoursPerWeek={featuredEmployee.workHoursPerWeek}
              sentimentScore={featuredEmployee.sentimentScore}
              engagementScore={featuredEmployee.engagementScore}
              tenureMonths={featuredEmployee.tenure}
              emptyStateMessage="No interventions recommended for this employee profile."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
