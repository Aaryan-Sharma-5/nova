import { Sparkles, AlertTriangle, ShieldCheck, Copy, ArrowRight } from 'lucide-react';
import { useWeeklyBrief, type WeeklyBriefScope } from '@/hooks/useWeeklyBrief';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { protectedGetApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token } = useAuth();
  const { data, loading, error } = useWeeklyBrief({ token, scope, teamId });
  const [selectedWindow, setSelectedWindow] = useState<'this' | 'previous'>('this');
  const [previousBrief, setPreviousBrief] = useState<typeof data | null>(null);
  const [topAction, setTopAction] = useState<{ intervention_name: string; description: string } | null>(null);
  const isDarkTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const storageKey = `nova_weekly_brief_cache_${scope}`;

  useEffect(() => {
    if (!data) return;

    const raw = window.localStorage.getItem(storageKey);
    const cached = raw ? JSON.parse(raw) : null;
    if (cached?.current?.week_of && cached.current.week_of !== data.week_of) {
      setPreviousBrief(cached.current);
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ current: data, previous: cached.current }),
      );
      return;
    }

    if (cached?.previous) {
      setPreviousBrief(cached.previous);
    }
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ current: data, previous: cached?.previous || null }),
    );
  }, [data, storageKey]);

  useEffect(() => {
    const loadTopAction = async () => {
      if (!token) {
        setTopAction(null);
        return;
      }

      try {
        const payload = await protectedGetApi<{ recommendations?: Array<{ intervention_name: string; description: string }> }>(
          '/api/interventions/recommendations',
          token,
        );
        const recommendation = payload?.recommendations?.[0];
        if (recommendation) {
          setTopAction({
            intervention_name: recommendation.intervention_name,
            description: recommendation.description,
          });
        } else {
          setTopAction(null);
        }
      } catch {
        setTopAction(null);
      }
    };

    void loadTopAction();
  }, [token]);

  const displayedData = selectedWindow === 'this' ? data : (previousBrief ?? data);

  const copyBrief = async () => {
    if (!displayedData || !displayedData.narrative) return;

    const signals = displayedData.structured_insight.key_signals.map((item, index) => `${index + 1}. ${item}`).join('\n');
    const briefText = [
      `Weekly Workforce Pulse (${displayedData.week_of})`,
      '',
      displayedData.narrative,
      '',
      'Key signals:',
      signals,
      '',
      `Next action: ${displayedData.structured_insight.recommended_action}`,
    ].join('\n');

    await navigator.clipboard.writeText(briefText);
    toast({ title: 'Copied!', description: 'Brief copied to clipboard.' });
  };

  const urgencyColor = displayedData ? urgencyAccent[displayedData.structured_insight.urgency] ?? '#FFE500' : '#FFE500';

  return (
    <div className="metric-card relative">
      <div
        className="h-1 -mx-5 -mt-5 mb-4 border-b-2 border-foreground"
        style={{ backgroundColor: 'var(--accent-primary)' }}
      />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center border-2 border-foreground shadow-[2px_2px_0px_#000]"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Sparkles className="h-4 w-4" style={{ color: 'var(--button-primary-text)' }} aria-hidden />
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
        {displayedData && !displayedData.suppressed && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="inline-flex border border-foreground">
              <button
                type="button"
                className="px-2 py-1 text-[10px] font-bold uppercase"
                style={selectedWindow === 'this' ? { backgroundColor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)' } : {}}
                onClick={() => setSelectedWindow('this')}
              >
                This Week
              </button>
              <button
                type="button"
                className="border-l border-foreground px-2 py-1 text-[10px] font-bold uppercase"
                style={selectedWindow === 'previous' ? { backgroundColor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)' } : {}}
                onClick={() => setSelectedWindow('previous')}
              >
                Previous Week
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyBrief()}
              className="inline-flex items-center gap-1 border-2 border-foreground px-2 py-1 text-[10px] font-bold uppercase"
              style={{ backgroundColor: 'var(--button-primary-bg)', color: 'var(--button-primary-text)' }}
            >
              <Copy className="h-3 w-3" /> Copy brief
            </button>
            <Pill color={isDarkTheme ? '#1e293b' : '#F5F5F5'}>Week of {displayedData.week_of}</Pill>
            <Pill color={urgencyColor}>{displayedData.structured_insight.urgency.replace('_', ' ')}</Pill>
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
        <div
          className="flex items-start gap-2 text-sm border-2 border-foreground p-3 shadow-[2px_2px_0px_#000]"
          style={{ backgroundColor: isDarkTheme ? '#1f2937' : '#FFF4E5' }}
        >
          <AlertTriangle className="h-4 w-4 text-[#FF1744] mt-0.5" aria-hidden />
          <p className="text-foreground">Brief unavailable: {error}</p>
        </div>
      )}

      {!loading && !error && displayedData?.suppressed && (
        <div
          className="flex items-start gap-2 text-sm border-2 border-foreground p-3 shadow-[2px_2px_0px_#000]"
          style={{ backgroundColor: isDarkTheme ? '#10231a' : '#E8F8EA' }}
        >
          <ShieldCheck className="h-4 w-4 text-[#00C853] mt-0.5" aria-hidden />
          <div>
            <p className="font-bold uppercase text-xs tracking-wider">Brief suppressed for privacy</p>
            <p className="mt-1 text-foreground">
              {displayedData.structured_insight.summary} — {displayedData.structured_insight.recommended_action}
            </p>
          </div>
        </div>
      )}

      {!loading && !error && displayedData && !displayedData.suppressed && displayedData.narrative && (
        <>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {displayedData.narrative}
          </p>

          <div className="mt-4 pt-4 border-t-2 border-foreground space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Key signals
            </p>
            <ul className="space-y-1.5 text-xs text-foreground">
              {displayedData.structured_insight.key_signals.map((signal, idx) => (
                <li key={idx} className="flex gap-2">
                  <span
                    className="inline-block h-4 w-4 shrink-0 text-center text-[10px] font-bold leading-4 border-2 border-foreground"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--button-primary-text)' }}
                  >
                    {idx + 1}
                  </span>
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
            <div
              className="border-2 border-foreground p-3 shadow-[2px_2px_0px_#000]"
              style={{ backgroundColor: isDarkTheme ? '#1e293b' : '#F5F5F5' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Next action
              </p>
              <p className="text-sm text-foreground">
                {topAction?.description || displayedData.structured_insight.recommended_action}
              </p>
              <button
                type="button"
                onClick={() => navigate('/employees')}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4"
                style={{ color: 'var(--accent-primary)' }}
              >
                Take Action <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              <span>Confidence: {displayedData.structured_insight.confidence}</span>
              <span>{displayedData.word_count} words</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
