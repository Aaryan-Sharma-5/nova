import { Navigate } from 'react-router-dom';
import HRDashboard from '@/components/dashboard/HRDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import ExecutiveDashboard from '@/components/dashboard/ExecutiveDashboard';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'employee') return <Navigate to="/your-data" replace />;
  if (user?.role === 'manager') return <ManagerDashboard />;
  if (user?.role === 'leadership') return <ExecutiveDashboard />;
  return <HRDashboard />;
}
