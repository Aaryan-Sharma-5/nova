import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, AlertTriangle, CalendarClock, Heart } from 'lucide-react';
import WeeklyBriefCard from '@/components/dashboard/WeeklyBriefCard';
import InterventionRecommendations from '@/components/interventions/InterventionRecommendations';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useInterventionInsights } from '@/hooks/useInterventionInsights';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

function TeamMetric({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subtitle: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="metric-card"
    >
      <div className="h-1 -mx-5 -mt-5 mb-4 border-b-2 border-foreground" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center border-2 border-foreground shadow-[2px_2px_0px_#000]"
          style={{ backgroundColor: color }}
        >
          <Icon className="h-4 w-4 text-[#1A1A1A]" />
        </div>
      </div>
    </motion.div>
  );
}

export default function ManagerDashboard() {
  const { employees } = useEmployees();
  const { token, user } = useAuth();

  // Demo scoping: manager sees a subset. In production this filters by reporting line.
  const directReports = useMemo(() => {
    return employees.slice(0, Math.min(12, employees.length));
  }, [employees]);

  const teamSize = directReports.length;
  const flightRisk = directReports.filter((e) => e.attritionRisk >= 60).length;
  const avgSentiment =
    teamSize > 0
      ? (directReports.reduce((s, e) => s + e.sentimentScore, 0) / teamSize).toFixed(2)
      : '—';
  const overdueOneOnOnes = Math.max(1, Math.round(teamSize * 0.2));

  const topReport = useMemo(() => {
    if (directReports.length === 0) return undefined;
    return [...directReports].sort(
      (a, b) => b.attritionRisk + b.burnoutRisk - (a.attritionRisk + a.burnoutRisk),
    )[0];
  }, [directReports]);

  const { interventionLoading, interventionsData } = useInterventionInsights({
    token,
    featuredEmployee: topReport,
    includeAnomalies: false,
    includeRecommendations: true,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Manager View — {user?.full_name ?? 'Team Lead'}
          </p>
          <h1 className="text-2xl font-bold font-heading text-foreground">My Team</h1>
        </div>
        <Link
          to="/employees"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 border-foreground bg-[#4ECDC4] shadow-[2px_2px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] transition-all"
        >
          Team Roster <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <WeeklyBriefCard scope="team" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TeamMetric icon={Users} label="Team Size" value={teamSize} subtitle="Direct reports" color="#4ECDC4" />
        <TeamMetric
          icon={AlertTriangle}
          label="Flight Risk"
          value={flightRisk}
          subtitle={`${teamSize ? Math.round((flightRisk / teamSize) * 100) : 0}% of team`}
          color="#FF1744"
        />
        <TeamMetric
          icon={CalendarClock}
          label="Overdue 1:1s"
          value={overdueOneOnOnes}
          subtitle="Action this week"
          color="#FFB300"
        />
        <TeamMetric icon={Heart} label="Avg Sentiment" value={avgSentiment} subtitle="Past 14 days" color="#FF6B9D" />
      </div>

      <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
        <CardHeader className="border-b-2 border-foreground pb-3">
          <CardTitle className="text-base font-heading uppercase tracking-wider">
            Direct Reports — Risk Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {directReports.slice(0, 8).map((emp) => (
              <Link
                key={emp.id}
                to={`/employees/${emp.id}/profile`}
                className="flex items-center justify-between border-2 border-foreground bg-background p-3 hover:bg-[#E0F7F4] transition-colors"
              >
                <div>
                  <p className="text-sm font-bold">{emp.name}</p>
                  <p className="text-xs text-muted-foreground">{emp.role ?? emp.department}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground"
                    style={{
                      backgroundColor:
                        emp.burnoutRisk >= 70 ? '#FF1744' : emp.burnoutRisk >= 50 ? '#FFB300' : '#00C853',
                      color: emp.burnoutRisk >= 70 ? '#fff' : '#1A1A1A',
                    }}
                  >
                    BR {emp.burnoutRisk}
                  </span>
                </div>
              </Link>
            ))}
            {directReports.length === 0 && (
              <p className="text-sm text-muted-foreground">No direct reports loaded.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {topReport && (
        <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
          <CardHeader className="border-b-2 border-foreground pb-3">
            <CardTitle className="text-base font-heading uppercase tracking-wider">
              Priority Action for {topReport.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <InterventionRecommendations
              employeeId={topReport.id}
              employeeName={topReport.name}
              recommendations={interventionsData?.recommendations ?? []}
              overallUrgency={interventionsData?.overallUrgency ?? 'low'}
              reasoning={
                interventionsData?.reasoning ??
                'Schedule a 1:1 to check in on workload and recent engagement.'
              }
              isLoading={interventionLoading}
              currentBurnoutRisk={topReport.burnoutRisk}
              currentAttritionRisk={topReport.attritionRisk}
              workHoursPerWeek={topReport.workHoursPerWeek}
              sentimentScore={topReport.sentimentScore}
              engagementScore={topReport.engagementScore}
              tenureMonths={topReport.tenure}
              emptyStateMessage="No interventions recommended this week — keep regular 1:1 cadence."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
