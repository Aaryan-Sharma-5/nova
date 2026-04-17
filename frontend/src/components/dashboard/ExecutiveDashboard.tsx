import { Link } from 'react-router-dom';
import { ArrowRight, TrendingDown, ShieldCheck, BarChart3, Clock, Download } from 'lucide-react';
import WorkforceHealthScore from '@/components/dashboard/WorkforceHealthScore';
import WeeklyBriefCard from '@/components/dashboard/WeeklyBriefCard';
import AttritionPredictionTimeline from '@/components/dashboard/AttritionPredictionTimeline';
import { useEmployees } from '@/contexts/EmployeeContext';
import { motion } from 'framer-motion';
import { useMemo } from 'react';

const ROI_TILES = [
  {
    icon: TrendingDown,
    label: 'Projected Attrition Reduction',
    value: '25%',
    desc: 'With AI-driven interventions',
    color: '#4ECDC4',
  },
  {
    icon: ShieldCheck,
    label: 'Early Detection Rate',
    value: '87%',
    desc: 'Employees flagged before exit',
    color: '#00C853',
  },
  {
    icon: BarChart3,
    label: 'Productivity Gain',
    value: '18%',
    desc: 'From wellbeing interventions',
    color: '#2563eb',
  },
  {
    icon: Clock,
    label: 'HR Time Saved',
    value: '15hrs/wk',
    desc: 'Automated analysis vs manual',
    color: '#FF6B9D',
  },
];

export default function ExecutiveDashboard() {
  const { employees } = useEmployees();

  // Department-level aggregation only (k-anonymity floor respected — no names).
  const departmentRollup = useMemo(() => {
    const byDept = new Map<string, { count: number; burnoutSum: number; attritionSum: number }>();
    for (const emp of employees) {
      const existing = byDept.get(emp.department) ?? { count: 0, burnoutSum: 0, attritionSum: 0 };
      existing.count += 1;
      existing.burnoutSum += emp.burnoutRisk;
      existing.attritionSum += emp.attritionRisk;
      byDept.set(emp.department, existing);
    }
    return Array.from(byDept.entries())
      .filter(([, v]) => v.count >= 5) // k-anonymity floor
      .map(([dept, v]) => ({
        dept,
        count: v.count,
        avgBurnout: Math.round(v.burnoutSum / v.count),
        avgAttrition: Math.round(v.attritionSum / v.count),
      }))
      .sort((a, b) => b.avgBurnout + b.avgAttrition - (a.avgBurnout + a.avgAttrition));
  }, [employees]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Leadership View
          </p>
          <h1 className="text-2xl font-bold font-heading text-foreground">Executive Pulse</h1>
        </div>
        <Link
          to="/org-health"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 border-foreground shadow-[2px_2px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] transition-all"
          style={{ backgroundColor: 'var(--button-primary-bg)', color: 'var(--button-primary-text)' }}
        >
          <Download className="h-3 w-3" /> Board Report
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkforceHealthScore />
        <WeeklyBriefCard scope="org" />
      </div>

      <section>
        <h3 className="mb-3 text-sm font-bold font-heading text-foreground uppercase tracking-wider">
          Business Impact Projections
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROI_TILES.map((tile, i) => (
            <motion.div
              key={tile.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="metric-card"
            >
              <div
                className="h-1 -mx-5 -mt-5 mb-4 border-b-2 border-foreground"
                style={{ backgroundColor: tile.color }}
              />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {tile.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{tile.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tile.desc}</p>
                </div>
                <div
                  className="flex h-8 w-8 items-center justify-center border-2 border-foreground shadow-[2px_2px_0px_#000]"
                  style={{ backgroundColor: tile.color }}
                >
                  <tile.icon className="h-4 w-4 text-[#1A1A1A]" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <AttritionPredictionTimeline />

      <section className="metric-card">
        <div
          className="h-1 -mx-5 -mt-5 mb-4 border-b-2 border-foreground"
          style={{ backgroundColor: '#2563eb' }}
        />
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Department Risk Rollup
            </p>
            <h3 className="text-base font-bold font-heading">Aggregate view (n≥5 per team)</h3>
          </div>
          <Link
            to="/org-health"
            className="text-xs font-bold uppercase tracking-wider text-foreground hover:underline inline-flex items-center gap-1"
          >
            Drill down <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="space-y-2">
          {departmentRollup.map((row) => (
            <div
              key={row.dept}
              className="grid grid-cols-[1fr,auto,auto,auto] items-center gap-3 border-2 border-foreground bg-background p-3"
            >
              <div>
                <p className="text-sm font-bold">{row.dept}</p>
                <p className="text-xs text-muted-foreground">{row.count} employees</p>
              </div>
              <span
                className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground"
                style={{
                  backgroundColor:
                    row.avgBurnout >= 60 ? '#FF1744' : row.avgBurnout >= 40 ? '#2563eb' : '#00C853',
                  color: row.avgBurnout >= 60 ? '#fff' : '#1A1A1A',
                }}
              >
                Burnout {row.avgBurnout}
              </span>
              <span
                className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground"
                style={{
                  backgroundColor:
                    row.avgAttrition >= 60 ? '#FF1744' : row.avgAttrition >= 40 ? '#2563eb' : '#00C853',
                  color: row.avgAttrition >= 60 ? '#fff' : '#1A1A1A',
                }}
              >
                Attrition {row.avgAttrition}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                n={row.count}
              </span>
            </div>
          ))}
          {departmentRollup.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No departments meet the k-anonymity floor (n≥5). Data loading or org too small.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
