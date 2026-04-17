import { Link, Navigate } from 'react-router-dom';
import HRDashboard from '@/components/dashboard/HRDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import ExecutiveDashboard from '@/components/dashboard/ExecutiveDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function DashboardPage() {
  useDocumentTitle('NOVA — Analytics Dashboard');
  const { user } = useAuth();

  if (user?.role === 'employee') return <Navigate to="/your-data" replace />;

  const content =
    user?.role === 'manager' ? <ManagerDashboard /> :
    user?.role === 'leadership' ? <ExecutiveDashboard /> :
    <HRDashboard />;

  return (
    <div className="space-y-4 dashboard-blue-theme">
      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/org-health" className="hover:text-foreground underline-offset-2 hover:underline">
          Org Wellbeing
        </Link>
        <span className="mx-2">›</span>
        <span className="text-foreground font-semibold">Analytics Dashboard</span>
      </nav>
      {content}
    </div>
  );
}
