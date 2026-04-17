import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { List, Network, Search } from 'lucide-react';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import PeerNetworkGraph from '@/components/employees/PeerNetworkGraph';
import FocusedOrgTree from '@/components/org/FocusedOrgTree';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useEmployees } from '@/contexts/EmployeeContext';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function EmployeesPage() {
  useDocumentTitle('NOVA — Employee Intelligence');
  const { employees } = useEmployees();
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');

  useEffect(() => {
    const dept = searchParams.get('dept');
    const filter = searchParams.get('filter');
    if (dept) {
      setDeptFilter(dept);
    }
    if (filter === 'high-attrition') {
      setRiskFilter('attrition-high');
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, role, or ID..."
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {['Engineering', 'Sales', 'Marketing', 'HR', 'Operations', 'Finance', 'Product', 'Design'].map((department) => (
              <SelectItem key={department} value={department}>
                {department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="burnout-high">High Burnout Risk</SelectItem>
            <SelectItem value="attrition-high">High Attrition Risk</SelectItem>
            <SelectItem value="low-risk">Low Risk Only</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearch('');
            setDeptFilter('all');
            setRiskFilter('all');
          }}
        >
          Reset
        </Button>
      </div>

      <div className="flex justify-end">
        <div className="inline-flex border-2 border-foreground shadow-[2px_2px_0px_#000] bg-card">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
            style={
              viewMode === 'list'
                ? { backgroundColor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)' }
                : undefined
            }
          >
            <List className="h-3 w-3" /> List View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className="inline-flex items-center gap-1 border-l-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
            style={
              viewMode === 'tree'
                ? { backgroundColor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)' }
                : undefined
            }
          >
            <Network className="h-3 w-3" /> Tree View
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <EmployeeTable
          employees={employees}
          search={search}
          deptFilter={deptFilter}
          riskFilter={riskFilter}
        />
      ) : (
        <div className="space-y-6">
          <FocusedOrgTree
            searchQuery={search}
            onSearchQueryChange={setSearch}
            selectedDepartment={deptFilter === 'all' ? 'All' : deptFilter}
            onSelectedDepartmentChange={(value) => setDeptFilter(value === 'All' ? 'all' : value)}
          />
          <PeerNetworkGraph />
        </div>
      )}
    </div>
  );
}
