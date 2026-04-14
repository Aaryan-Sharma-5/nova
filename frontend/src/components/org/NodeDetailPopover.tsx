import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ExternalLink, GitBranch, X } from 'lucide-react';
import type { OrgNode } from '@/hooks/useOrgHierarchy';

const DEPT_COLORS: Record<string, string> = {
  Engineering: '#3b82f6',
  Sales: '#f97316',
  HR: '#ec4899',
  Design: '#8b5cf6',
  Finance: '#14b8a6',
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function dotColor(value: number, isNegative = false): string {
  const effective = isNegative ? 1 - value : value;
  if (effective >= 0.66) return '#22c55e';
  if (effective >= 0.33) return '#eab308';
  return '#ef4444';
}

type Props = {
  node: OrgNode;
  x: number;
  y: number;
  onClose: () => void;
  onViewSubtree: (id: string) => void;
  onScheduleOneOnOne: (node: OrgNode) => void;
};

export default function NodeDetailPopover({
  node,
  x,
  y,
  onClose,
  onViewSubtree,
  onScheduleOneOnOne,
}: Props) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = window.setTimeout(
      () => document.addEventListener('mousedown', handleClick),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const deptColor = DEPT_COLORS[node.department] ?? '#64748b';
  const directReports = node.children?.length ?? 0;

  return (
    <div
      ref={ref}
      className="absolute z-20 w-[280px] border-2 border-foreground bg-card shadow-[4px_4px_0px_#000]"
      style={{ left: x, top: y }}
    >
      <div className="flex items-start justify-between border-b-2 border-foreground p-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center border-2 border-foreground text-sm font-bold text-white"
            style={{ backgroundColor: deptColor }}
          >
            {initials(node.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{node.name}</p>
            <p className="truncate text-xs text-muted-foreground">{node.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Department</span>
          <span className="font-bold">{node.department}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tenure</span>
          <span className="font-bold">{node.tenure_months} months</span>
        </div>
        {directReports > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Direct Reports</span>
            <span className="font-bold">{directReports}</span>
          </div>
        )}

        <div className="flex items-center gap-3 border-t-2 border-foreground pt-2">
          <div className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: dotColor(node.burnout_score, true) }}
            />
            <span className="text-[10px] font-bold uppercase">Burnout</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: dotColor(node.engagement_score) }}
            />
            <span className="text-[10px] font-bold uppercase">Engage</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: dotColor(node.sentiment_score) }}
            />
            <span className="text-[10px] font-bold uppercase">Sentiment</span>
          </div>
        </div>
      </div>

      <div className="grid gap-1 border-t-2 border-foreground p-2">
        <button
          type="button"
          onClick={() => navigate(`/employees/${node.id}/profile`)}
          className="flex items-center justify-between border-2 border-foreground bg-[#FFE500] px-2 py-1 text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#000]"
        >
          View Full Profile <ExternalLink className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onScheduleOneOnOne(node)}
          className="flex items-center justify-between border-2 border-foreground bg-background px-2 py-1 text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#000]"
        >
          Schedule 1:1 <Calendar className="h-3 w-3" />
        </button>
        {directReports > 0 && (
          <button
            type="button"
            onClick={() => onViewSubtree(node.id)}
            className="flex items-center justify-between border-2 border-foreground bg-background px-2 py-1 text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#000]"
          >
            View Subtree <GitBranch className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
