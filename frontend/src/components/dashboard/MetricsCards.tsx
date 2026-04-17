import { Users, TrendingUp, AlertTriangle, UserMinus } from 'lucide-react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  tooltip: string;
  delay: number;
}

function MetricCard({ title, value, subtitle, icon, accentColor, tooltip, delay }: MetricCardProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay * 0.1, duration: 0.3 }}
          className="metric-card group cursor-default"
        >
          {/* Accent top stripe */}
          <div className="h-1 -mx-5 -mt-5 mb-4 border-b-2 border-foreground" style={{ backgroundColor: accentColor }} />

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <div
              className="flex h-10 w-10 items-center justify-center border-2 border-foreground shadow-[2px_2px_0px_#000]"
              style={{ backgroundColor: accentColor }}
            >
              {icon}
            </div>
          </div>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent><p>{tooltip}</p></TooltipContent>
    </Tooltip>
  );
}

export function MetricsCards() {
  const { employees } = useEmployees();

  const totalEmployees = employees.length;
  const highPerformers = employees.filter(e => e.performanceScore >= 80).length;
  const burnoutRisk = employees.filter(e => e.burnoutRisk >= 60).length;
  const attritionRisk = employees.filter(e => e.attritionRisk >= 60).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Employees"
        value={totalEmployees}
        subtitle="Active in system"
        icon={<Users className="h-5 w-5 text-[#1A1A1A]" />}
        accentColor="#4ECDC4"
        tooltip="Total number of employees tracked in the system"
        delay={0}
      />
      <MetricCard
        title="High Performers"
        value={highPerformers}
        subtitle={`${Math.round(highPerformers / totalEmployees * 100)}% of workforce`}
        icon={<TrendingUp className="h-5 w-5 text-[#1A1A1A]" />}
        accentColor="#00C853"
        tooltip="Employees with performance score ≥ 80"
        delay={1}
      />
      <MetricCard
        title="Burnout Risk"
        value={burnoutRisk}
        subtitle="Employees at high risk"
        icon={<AlertTriangle className="h-5 w-5 text-[#1A1A1A]" />}
        accentColor="#2563eb"
        tooltip="Employees with burnout risk score ≥ 60%"
        delay={2}
      />
      <MetricCard
        title="Attrition Risk"
        value={attritionRisk}
        subtitle="Potential flight risks"
        icon={<UserMinus className="h-5 w-5 text-white" />}
        accentColor="#FF1744"
        tooltip="Employees with attrition risk score ≥ 60%"
        delay={3}
      />
    </div>
  );
}
