import { Employee } from '@/types/employee';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getContributingFactors, generateInterventions } from '@/utils/riskCalculation';
import { getSentimentLabel } from '@/utils/sentimentAnalysis';
import { AlertTriangle, Lightbulb, TrendingUp, Clock, Briefcase, Calendar, Smile, Frown, Meh } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useNavigate } from 'react-router-dom';

interface Props {
  employee: Employee | null;
  onClose: () => void;
}

function getSentimentIcon(score: number) {
  if (score > 0.15) return Smile;
  if (score < -0.15) return Frown;
  return Meh;
}

export function EmployeeDetailDialog({ employee, onClose }: Props) {
  const { getEmployee } = useEmployees();
  const navigate = useNavigate();
  if (!employee) return null;
  const manager = employee.reportsTo ? getEmployee(employee.reportsTo) : undefined;

  const factors = getContributingFactors(employee);
  const interventions = generateInterventions(
    employee.burnoutRisk,
    employee.attritionRisk,
    employee.workHoursPerWeek,
    employee.sentimentScore,
    employee.engagementScore,
    {
      recentBurnoutChange: employee.burnoutRisk - (employee.burnoutRisk * 0.85),
      recentSentimentChange: employee.sentimentHistory.length >= 2
        ? employee.sentimentHistory[employee.sentimentHistory.length - 1].score - employee.sentimentHistory[Math.max(0, employee.sentimentHistory.length - 4)].score
        : 0,
      upcomingDeadlineWeeks: employee.projectLoad >= 5 ? 1 : 3,
    },
  );

  const performanceData = employee.performanceHistory.map(p => ({
    date: p.date.slice(5), // MM-DD
    Performance: p.score,
  }));

  const sentimentData = employee.sentimentHistory.map(p => ({
    date: p.date.slice(5),
    Sentiment: Math.round(p.score * 100) / 100,
  }));
  const SentimentIcon = getSentimentIcon(employee.sentimentScore);

  return (
    <Dialog open={!!employee} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {employee.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{employee.name}</h3>
              <p className="text-sm font-normal text-muted-foreground">{employee.role} · {employee.department}</p>
              <p className="text-xs text-muted-foreground">
                {employee.reportsTo && manager ? (
                  <span>
                    Reports to: {' '}
                    <button
                      type="button"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      onClick={() => navigate(`/employees/${manager.id}/profile`)}
                    >
                      {manager.name}
                    </button>{' '}
                    ({manager.id})
                  </span>
                ) : (
                  <span>Reports to: — (Organization Head)</span>
                )}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatItem icon={<TrendingUp className="h-4 w-4 text-metric-blue" />} label="Performance" value={`${employee.performanceScore}/100`} />
          <StatItem icon={<Clock className="h-4 w-4 text-metric-amber" />} label="Work Hours" value={`${employee.workHoursPerWeek}hrs/wk`} />
          <StatItem icon={<Briefcase className="h-4 w-4 text-metric-green" />} label="Tenure" value={`${employee.tenure} months`} />
          <StatItem icon={<Calendar className="h-4 w-4 text-muted-foreground" />} label="Last Review" value={employee.lastAssessment} />
        </div>

        {/* Risk scores */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[140px] rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Burnout Risk</p>
            <div className="flex items-center gap-2">
              <RiskBadge value={employee.burnoutRisk} />
            </div>
          </div>
          <div className="flex-1 min-w-[140px] rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Attrition Risk</p>
            <div className="flex items-center gap-2">
              <RiskBadge value={employee.attritionRisk} />
            </div>
          </div>
          <div className="flex-1 min-w-[140px] rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Sentiment</p>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SentimentIcon className={`h-4 w-4 ${employee.sentimentScore > 0 ? 'text-emerald-600' : employee.sentimentScore < 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
              <span>
                {getSentimentLabel(employee.sentimentScore)} ({employee.sentimentScore > 0 ? '+' : ''}{employee.sentimentScore.toFixed(2)})
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Performance Trend */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Performance Trend (12 months)</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ border: '1px solid #475569', boxShadow: 'none', backgroundColor: '#020617' }} />
              <Line type="monotone" dataKey="Performance" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Trend */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Sentiment Trend (12 months)</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={sentimentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ border: '1px solid #475569', boxShadow: 'none', backgroundColor: '#020617' }} />
              <Line type="monotone" dataKey="Sentiment" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <Separator />

        {/* Contributing Factors */}
        {factors.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-metric-amber" /> Contributing Risk Factors
            </h4>
            <div className="space-y-2">
              {factors.map((f, i) => (
                <div key={i} className={`rounded-lg border p-3 ${
                  f.impact === 'high' ? 'border-risk-high/30 bg-risk-high/5' :
                  f.impact === 'medium' ? 'border-risk-medium/30 bg-risk-medium/5' : 'border-border'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`risk-badge ${f.impact === 'high' ? 'risk-high' : f.impact === 'medium' ? 'risk-medium' : 'risk-low'}`}>
                      {f.impact}
                    </span>
                    <span className="text-sm font-medium">{f.factor}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Interventions */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-metric-blue" /> AI-Recommended Interventions
          </h4>
          <ul className="space-y-2">
            {interventions.map((int, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">{i + 1}</span>
                {int}
              </li>
            ))}
          </ul>
        </div>

        {/* Recent Feedback */}
        {employee.recentFeedback.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3">Recent Feedback</h4>
            <div className="space-y-2">
              {employee.recentFeedback.map((fb, i) => (
                <blockquote key={i} className="border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground italic">
                  "{fb}"
                </blockquote>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
