import { Link } from 'react-router-dom';
import { List, Network } from 'lucide-react';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import PeerNetworkGraph from '@/components/employees/PeerNetworkGraph';

export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="inline-flex border-2 border-foreground shadow-[2px_2px_0px_#000]">
          <button
            type="button"
            className="inline-flex items-center gap-1 bg-[#FFE500] px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
            disabled
          >
            <List className="h-3 w-3" /> List View
          </button>
          <Link
            to="/employees/org-tree"
            className="inline-flex items-center gap-1 border-l-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-[#FFF9D6]"
          >
            <Network className="h-3 w-3" /> Tree View
          </Link>
        </div>
      </div>
      <EmployeeTable />
      <PeerNetworkGraph />
    </div>
  );
}
