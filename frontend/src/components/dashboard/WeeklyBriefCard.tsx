import { Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useWeeklyBrief, type WeeklyBriefScope } from '@/hooks/useWeeklyBrief';
import { useAuth } from '@/contexts/AuthContext';

type WeeklyBriefCardProps = {
  scope?: WeeklyBriefScope;
  teamId?: string | null;
};

const urgencyAccent: Record<string, string> = {
  immediate: '#FF1744',
  this_week: '#FFB300',
  monitor: '#00C853',
};

function Pill({ children, color = '#FFE500' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground shadow-[2px_2px_0px_#000]"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

export default function WeeklyBriefCard({ scope = 'org', teamId = null }: WeeklyBriefCardProps) {
  const { token } = useAuth();
  const { data, loading, error } = useWeeklyBrief({ token, scope, teamId });

  const urgencyColor = data ? urgencyAccent[data.structured_insight.urgency] ?? '#FFE500' : '#FFE500';

  return (
    <div className="metric-card relative">
      <div
        className="h-1 -mx-5 -mt-5 mb-4 border-b-2 border-foreground"
        style={{ backgroundColor: '#FFE500' }}
      />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center border-2 border-foreground shadow-[2px_2px_0px_#000]"
            style={{ backgroundColor: '#FFE500' }}
          >
            <Sparkles className="h-4 w-4 text-[#1A1A1A]" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Weekly Workforce Pulse
            </p>
            <h3 className="text-base font-bold font-heading text-foreground">
              {scope === 'team' ? 'Team Brief' : 'Org Brief'}
            </h3>
          </div>
        </div>
        {data && !data.suppressed && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Pill color="#F5F5F5">Week of {data.week_of}</Pill>
            <Pill color={urgencyColor}>{data.structured_insight.urgency.replace('_', ' ')}</Pill>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true">
          <div className="h-3 w-3/4 bg-muted animate-pulse border border-foreground" />
          <div className="h-3 w-full bg-muted animate-pulse border border-foreground" />
          <div className="h-3 w-5/6 bg-muted animate-pulse border border-foreground" />
          <div className="h-3 w-2/3 bg-muted animate-pulse border border-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 text-sm border-2 border-foreground bg-[#FFF4E5] p-3 shadow-[2px_2px_0px_#000]">
          <AlertTriangle className="h-4 w-4 text-[#FF1744] mt-0.5" aria-hidden />
          <p className="text-foreground">Brief unavailable: {error}</p>
        </div>
      )}

      {!loading && !error && data?.suppressed && (
        <div className="flex items-start gap-2 text-sm border-2 border-foreground bg-[#E8F8EA] p-3 shadow-[2px_2px_0px_#000]">
          <ShieldCheck className="h-4 w-4 text-[#00C853] mt-0.5" aria-hidden />
          <div>
            <p className="font-bold uppercase text-xs tracking-wider">Brief suppressed for privacy</p>
            <p className="mt-1 text-foreground">
              {data.structured_insight.summary} — {data.structured_insight.recommended_action}
            </p>
          </div>
        </div>
      )}

      {!loading && !error && data && !data.suppressed && data.narrative && (
        <>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {data.narrative}
          </p>

          <div className="mt-4 pt-4 border-t-2 border-foreground space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Key signals
            </p>
            <ul className="space-y-1.5 text-xs text-foreground">
              {data.structured_insight.key_signals.map((signal, idx) => (
                <li key={idx} className="flex gap-2">
                  <span
                    className="inline-block h-4 w-4 shrink-0 text-center text-[10px] font-bold leading-4 border-2 border-foreground"
                    style={{ backgroundColor: '#FFE500' }}
                  >
                    {idx + 1}
                  </span>
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
            <div
              className="border-2 border-foreground p-3 shadow-[2px_2px_0px_#000]"
              style={{ backgroundColor: '#F5F5F5' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Next action
              </p>
              <p className="text-sm text-foreground">{data.structured_insight.recommended_action}</p>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              <span>Confidence: {data.structured_insight.confidence}</span>
              <span>{data.word_count} words</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
