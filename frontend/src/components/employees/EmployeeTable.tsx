import { useState, useMemo } from 'react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { Employee, Department, getRiskLevel } from '@/types/employee';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, Download, ChevronUp, ChevronDown, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { EmployeeDetailDialog } from '@/components/employees/EmployeeDetailDialog';
import FlightRiskDrawer from '@/components/employees/FlightRiskDrawer';
import { getSentimentLabel } from '@/utils/sentimentAnalysis';
import { detectAnomaly } from '@/utils/anomalyDetection';

type SortField = 'name' | 'department' | 'performanceScore' | 'sentimentScore' | 'burnoutRisk' | 'attritionRisk';
type SortDir = 'asc' | 'desc';

export function EmployeeTable() {
  const { employees } = useEmployees();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('burnoutRisk');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [flightRiskEmployee, setFlightRiskEmployee] = useState<Employee | null>(null);

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

  const departments: Department[] = ['Engineering', 'Sales', 'Marketing', 'HR', 'Operations', 'Finance', 'Product', 'Design'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, role, or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Risk Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="burnout-high">High Burnout Risk</SelectItem>
            <SelectItem value="attrition-high">High Attrition Risk</SelectItem>
            <SelectItem value="low-risk">Low Risk Only</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} employees found</p>

      {/* Table */}
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
            {filtered.map((emp, i) => (
              <tr
                key={emp.id}
                className="cursor-pointer transition-colors hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{emp.name}</p>
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
                  <RiskBadge value={emp.burnoutRisk} />
                </td>
                <td 
                  className="px-3 py-3 text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlightRiskEmployee(emp);
                  }}
                >
                  <RiskBadge value={emp.attritionRisk} />
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
            ))}
          </tbody>
        </table>
      </div>

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
    </motion.div>
  );
}
