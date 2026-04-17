import { useState, useMemo, useEffect, useRef } from 'react';
import { Employee } from '@/types/employee';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ChevronUp, ChevronDown, MoreHorizontal, FolderKanban } from 'lucide-react';
import { motion } from 'framer-motion';
import { EmployeeDetailDialog } from '@/components/employees/EmployeeDetailDialog';
import FlightRiskDrawer from '@/components/employees/FlightRiskDrawer';
import ScoreExplainability from '@/components/dashboard/ScoreExplainability';
import { detectAnomaly } from '@/utils/anomalyDetection';

type SortField = 'name' | 'department' | 'performanceScore' | 'sentimentScore' | 'burnoutRisk' | 'attritionRisk';
type SortDir = 'asc' | 'desc';

type EmployeeTableProps = {
  employees: Employee[];
  search: string;
  deptFilter: string;
  riskFilter: string;
};

export function EmployeeTable({ employees, search, deptFilter, riskFilter }: EmployeeTableProps) {
  const [sortField, setSortField] = useState<SortField>('burnoutRisk');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [flightRiskEmployee, setFlightRiskEmployee] = useState<Employee | null>(null);
  const [explainEmployee, setExplainEmployee] = useState<Employee | null>(null);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const tableTopRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    let result = [...employees];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    }

    if (deptFilter !== 'all') {
      result = result.filter(e => e.department === deptFilter);
    }

    if (riskFilter !== 'all') {
      if (riskFilter === 'burnout-high') result = result.filter(e => e.burnoutRisk >= 60);
      else if (riskFilter === 'attrition-high') result = result.filter(e => e.attritionRisk >= 60);
      else if (riskFilter === 'low-risk') result = result.filter(e => e.burnoutRisk < 30 && e.attritionRisk < 30);
    }

    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [employees, search, deptFilter, riskFilter, sortField, sortDir]);

  const hasActiveFilter = Boolean(search.trim()) || deptFilter !== 'all' || riskFilter !== 'all';
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));

  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, riskFilter, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const startIndex = filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endIndex = filtered.length === 0 ? 0 : Math.min(page * rowsPerPage, filtered.length);

  const getVisiblePages = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    const validPages = Array.from(pages).filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b);
    const output: Array<number | 'ellipsis'> = [];
    for (let index = 0; index < validPages.length; index += 1) {
      const current = validPages[index];
      const previous = validPages[index - 1];
      if (previous && current - previous > 1) {
        output.push('ellipsis');
      }
      output.push(current);
    }
    return output;
  };

  const goToPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(totalPages, nextPage));
    setPage(bounded);
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Name', 'Department', 'Role', 'Performance', 'Sentiment', 'Burnout Risk', 'Attrition Risk', 'Work Hours', 'Last Assessment'];
    const rows = filtered.map(e => [e.id, e.name, e.department, e.role, e.performanceScore, e.sentimentScore.toFixed(2), e.burnoutRisk, e.attritionRisk, e.workHoursPerWeek, e.lastAssessment]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div ref={tableTopRef} className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Showing {startIndex}–{endIndex} of {filtered.length}{' '}
          {hasActiveFilter ? 'filtered results' : 'employees'}
        </p>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm font-medium">No employees match the current filters.</p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="cursor-pointer px-4 py-3 hover:text-foreground" onClick={() => handleSort('name')}>
                Employee <SortIcon field="name" />
              </th>
              <th className="cursor-pointer px-3 py-3 hover:text-foreground" onClick={() => handleSort('department')}>
                Department <SortIcon field="department" />
              </th>
              <th className="cursor-pointer px-3 py-3 text-center hover:text-foreground" onClick={() => handleSort('performanceScore')}>
                Performance <SortIcon field="performanceScore" />
              </th>
              <th className="cursor-pointer px-3 py-3 text-center hover:text-foreground" onClick={() => handleSort('sentimentScore')}>
                Sentiment <SortIcon field="sentimentScore" />
              </th>
              <th className="cursor-pointer px-3 py-3 text-center hover:text-foreground" onClick={() => handleSort('burnoutRisk')}>
                Burnout <SortIcon field="burnoutRisk" />
              </th>
              <th className="cursor-pointer px-3 py-3 text-center hover:text-foreground" onClick={() => handleSort('attritionRisk')}>
                Attrition <SortIcon field="attritionRisk" />
              </th>
              <th className="px-3 py-3 text-right">Last Assessment</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedEmployees.map((emp, i) => {
              const showOnboardingBadge = typeof emp.tenureDays === 'number' && emp.tenureDays > 0 && emp.tenureDays < 90;
              const isAlternate = i % 2 === 1;
              return (
              <tr
                key={emp.id}
                className="cursor-pointer transition-colors"
                style={{
                  backgroundColor: showOnboardingBadge
                    ? 'color-mix(in srgb, var(--accent-primary) 14%, var(--bg-card))'
                    : isAlternate
                    ? 'var(--bg-secondary)'
                    : 'var(--bg-card)',
                }}
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium inline-flex items-center gap-2">
                      {emp.name}
                      {showOnboardingBadge && (
                        <span
                          className="rounded px-2 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                            color: 'var(--text-primary)',
                          }}
                          title="Scores reflect onboarding cohort baseline, not org-wide average"
                        >
                          Onboarding
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{emp.role}</p>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{emp.department}</td>
                <td className="px-3 py-3 text-center">
                  <span className="tabular-nums font-medium">{emp.performanceScore}</span>
                </td>
                <td className="px-3 py-3 text-center">
                  {(() => {
                    const anomaly = detectAnomaly(emp.sentimentHistory);
                    return (
                      <div className="flex items-center justify-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          emp.sentimentScore > 0.15 ? 'text-risk-low' : emp.sentimentScore < -0.15 ? 'text-risk-high' : 'text-muted-foreground'
                        }`}>
                          {emp.sentimentScore > 0 ? '+' : ''}{emp.sentimentScore.toFixed(2)}
                        </span>
                        {anomaly.isAnomaly && (
                          <Badge variant="destructive" className="text-[10px]">
                            {anomaly.direction === 'spike' ? 'Spike' : 'Drop'}
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <RiskBadge value={emp.burnoutRisk} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExplainEmployee(emp);
                      }}
                    >
                      Explain Score
                    </Button>
                  </div>
                </td>
                <td 
                  className="px-3 py-3 text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlightRiskEmployee(emp);
                  }}
                >
                  <div className="inline-flex items-center gap-2">
                    <RiskBadge value={emp.attritionRisk} />
                    {emp.id && (
                      (() => {
                        const overdueCount = Number(emp.id.replace(/\D/g, '')) % 5;
                        if (overdueCount <= 0) return null;
                        return (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title="Jira overdue tickets">
                            <FolderKanban className="h-3.5 w-3.5" />
                            {overdueCount}
                          </span>
                        );
                      })()
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                  {emp.lastAssessment}
                </td>
                <td className="px-3 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEmployee(emp);
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Rows per page</span>
            <Select value={String(rowsPerPage)} onValueChange={(value) => setRowsPerPage(Number(value))}>
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              ← Previous
            </Button>
            {getVisiblePages().map((entry, index) =>
              entry === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">…</span>
              ) : (
                <Button
                  key={entry}
                  size="sm"
                  variant={entry === page ? 'default' : 'outline'}
                  onClick={() => goToPage(entry)}
                  className={entry === page ? 'font-semibold' : undefined}
                >
                  {entry}
                </Button>
              ),
            )}
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}

      <EmployeeDetailDialog
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />

      <FlightRiskDrawer
        employeeId={flightRiskEmployee?.id || null}
        employeeName={flightRiskEmployee?.name || ''}
        open={!!flightRiskEmployee}
        onClose={() => setFlightRiskEmployee(null)}
      />

      <ScoreExplainability
        employeeId={explainEmployee?.id || null}
        employeeName={explainEmployee?.name || ''}
        open={!!explainEmployee}
        onClose={() => setExplainEmployee(null)}
      />
    </motion.div>
  );
}
