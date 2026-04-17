import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Loader2, AlertTriangle } from 'lucide-react';
import {
  useDepartmentHeatmap,
  useDepartmentDrilldown,
  type EfficiencyDimension,
} from '@/hooks/useDepartmentHeatmap';
import DeptDrilldownPanel from '@/components/departments/DeptDrilldownPanel';
import PeerNetworkGraph from '@/components/employees/PeerNetworkGraph';
import { Card } from '@/components/ui/card';
import { patchAgentContext } from '@/lib/agentBus';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const DIMENSION_LABELS: Record<EfficiencyDimension, string> = {
  avg_performance: 'Avg Performance',
  avg_engagement: 'Avg Engagement',
  burnout_rate: 'Burnout Rate',
  attrition_risk: 'Attrition Risk',
  sentiment_score: 'Sentiment Score',
  workload_index: 'Workload Index',
};

const NEGATIVE_DIMS = new Set<EfficiencyDimension>([
  'burnout_rate',
  'attrition_risk',
  'workload_index',
]);

const DEPT_HEADCOUNT: Record<string, number> = {
  Engineering: 22,
  Sales: 18,
  HR: 9,
  Design: 12,
  Finance: 11,
};

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

const RED: [number, number, number] = [239, 68, 68];
const YELLOW: [number, number, number] = [234, 179, 8];
const GREEN: [number, number, number] = [34, 197, 94];

function cellColor(value: number, isNegative: boolean): string {
  const effective = isNegative ? 1 - value : value;
  if (effective <= 0.5) {
    const t = effective / 0.5;
    return lerpColor(RED, YELLOW, t);
  }
  const t = (effective - 0.5) / 0.5;
  return lerpColor(YELLOW, GREEN, t);
}

function overallEfficiency(
  dims: Record<EfficiencyDimension, number>,
  dimensions: EfficiencyDimension[],
): number {
  let sum = 0;
  for (const dim of dimensions) {
    const v = dims[dim];
    sum += NEGATIVE_DIMS.has(dim) ? 1 - v : v;
  }
  return sum / dimensions.length;
}

export default function DeptHeatmapPage() {
  useDocumentTitle('NOVA — Department Heatmap');
  const { data, loading, error } = useDepartmentHeatmap();
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [hoveredDimension, setHoveredDimension] = useState<EfficiencyDimension | null>(null);
  const [sortByEfficiency, setSortByEfficiency] = useState(false);

  const {
    data: drilldown,
    loading: drilldownLoading,
    error: drilldownError,
  } = useDepartmentDrilldown(selectedDept);

  const orderedDepartments = useMemo(() => {
    if (!data) return [];
    const departments = [...data.departments];
    if (sortByEfficiency) {
      departments.sort(
        (a, b) =>
          overallEfficiency(data.matrix[b], data.dimensions) -
          overallEfficiency(data.matrix[a], data.dimensions),
      );
    }
    return departments;
  }, [data, sortByEfficiency]);

  const orgAverages = useMemo(() => {
    if (!data) return {} as Record<EfficiencyDimension, number>;
    const averages = {} as Record<EfficiencyDimension, number>;
    for (const dim of data.dimensions) {
      const values = data.departments.map((d) => data.matrix[d][dim]);
      averages[dim] = values.reduce((acc, v) => acc + v, 0) / values.length;
    }
    return averages;
  }, [data]);

  useEffect(() => {
    patchAgentContext({
      selected_department: selectedDept,
      hovered_cell_dimension: hoveredDimension,
    });
  }, [selectedDept, hoveredDimension]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-8 w-8 text-[#FF1744]" />
        <p className="text-sm font-bold">Unable to load heatmap</p>
        <p className="text-xs text-muted-foreground">{error ?? 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card">
          <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-3">
            <div>
              <h2 className="text-base font-bold font-heading uppercase tracking-wider">
                Department Efficiency
              </h2>
              <p className="text-[10px] text-muted-foreground">
                Click any cell to drill down · Hover for details
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSortByEfficiency((prev) => !prev)}
              className={`inline-flex items-center gap-1 border-2 border-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-[2px_2px_0px_#000] ${
                sortByEfficiency ? 'bg-[#FFE500]' : 'bg-background'
              }`}
            >
              <ArrowUpDown className="h-3 w-3" />
              Sort by Overall Efficiency
            </button>
          </div>

          <div className="overflow-x-auto p-4">
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `minmax(180px, 1fr) repeat(${data.dimensions.length}, minmax(90px, 1fr))`,
              }}
            >
              <div className="flex items-end pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Department
                </span>
              </div>
              {data.dimensions.map((dim) => (
                <div
                  key={dim}
                  className="flex items-end justify-center pb-2"
                  style={{ height: 100 }}
                >
                  <span
                    className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider"
                    style={{ transform: 'rotate(-45deg)', transformOrigin: 'left bottom' }}
                  >
                    {DIMENSION_LABELS[dim]}
                  </span>
                </div>
              ))}

              {orderedDepartments.map((dept) => {
                const isSelected = dept === selectedDept;
                const flags = data.risk_flags[dept] ?? [];
                return (
                  <HeatmapRow
                    key={dept}
                    dept={dept}
                    dims={data.matrix[dept]}
                    dimensions={data.dimensions}
                    orgAverages={orgAverages}
                    flags={flags}
                    isSelected={isSelected}
                    onSelect={setSelectedDept}
                    onHoverDimension={setHoveredDimension}
                  />
                );
              })}
            </div>

            <div className="mt-6 border-t-2 border-foreground pt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Legend
              </p>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-48 border-2 border-foreground"
                  style={{
                    background: 'linear-gradient(to right, #ef4444, #eab308, #22c55e)',
                  }}
                />
                <span className="text-[10px] font-bold">
                  Needs Attention → Average → Excellent
                </span>
              </div>
            </div>
          </div>
        </Card>

        <PeerNetworkGraph
          departmentFilter={selectedDept ?? undefined}
          className="border-2 border-foreground shadow-[4px_4px_0px_#000] bg-card"
        />
      </div>

      <Card className="border-2 border-foreground shadow-[4px_4px_0px_#000] lg:col-span-2 bg-card">
        <DeptDrilldownPanel
          department={selectedDept}
          data={drilldown}
          loading={drilldownLoading}
          error={drilldownError}
        />
      </Card>
    </div>
  );
}

type HeatmapRowProps = {
  dept: string;
  dims: Record<EfficiencyDimension, number>;
  dimensions: EfficiencyDimension[];
  orgAverages: Record<EfficiencyDimension, number>;
  flags: string[];
  isSelected: boolean;
  onSelect: (dept: string) => void;
  onHoverDimension: (dim: EfficiencyDimension | null) => void;
};

function HeatmapRow({
  dept,
  dims,
  dimensions,
  orgAverages,
  flags,
  isSelected,
  onSelect,
  onHoverDimension,
}: HeatmapRowProps) {
  return (
    <>
      <div
        className={`flex flex-col justify-center border-l-4 px-2 py-1 ${
          isSelected ? 'border-[#FFE500] bg-[#FFF9D6]' : 'border-transparent'
        }`}
      >
        <p className="text-sm font-bold">{dept}</p>
        <p className="text-[10px] text-muted-foreground">
          {DEPT_HEADCOUNT[dept] ?? 0} employees
        </p>
        {flags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {flags.map((flag) => (
              <span
                key={flag}
                className="border border-foreground bg-[#FF1744] px-1 text-[9px] font-bold uppercase tracking-wider text-white"
              >
                <AlertTriangle className="mr-1 inline-block h-2.5 w-2.5 align-middle" />
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
      {dimensions.map((dim) => {
        const value = dims[dim];
        const isNeg = NEGATIVE_DIMS.has(dim);
        const avg = orgAverages[dim];
        const above = value > avg;
        const tooltip = `${dept} — ${DIMENSION_LABELS[dim]}: ${Math.round(
          value * 100,
        )}%\nOrg average: ${Math.round(avg * 100)}% | ${above ? 'above' : 'below'} average`;
        return (
          <Tooltip key={`${dept}-${dim}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelect(dept)}
                onMouseEnter={() => onHoverDimension(dim)}
                onMouseLeave={() => onHoverDimension(null)}
                className={`flex h-14 items-center justify-center border-2 border-foreground text-sm font-bold transition-transform hover:scale-105 ${
                  isSelected ? 'ring-2 ring-[#FFE500]' : ''
                }`}
                style={{
                  backgroundColor: cellColor(value, isNeg),
                  color: '#1A1A1A',
                }}
              >
                {Math.round(value * 100)}%
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <pre className="whitespace-pre-wrap text-[11px] font-mono">{tooltip}</pre>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}
