import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquareText, Brain, RefreshCw, Menu, X, HeartPulse, ShieldCheck, UserRound, LogOut } from 'lucide-react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth';

const CORE_NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/sentiment', icon: MessageSquareText, label: 'Sentiment Analyzer' },
  { to: '/org-health', icon: HeartPulse, label: 'Org Health' },
  { to: '/employee/profile', icon: UserRound, label: 'My Backend Profile' },
];

const ROLE_NAV_ITEMS: Record<UserRole, Array<{ to: string; icon: typeof ShieldCheck; label: string }>> = {
  employee: [
    { to: '/your-data', icon: UserRound, label: 'Your Data' },
  ],
  manager: [
    { to: '/manager/team-alerts', icon: ShieldCheck, label: 'Manager API' },
  ],
  hr: [
    { to: '/hr/org-risk-distribution', icon: ShieldCheck, label: 'HR API' },
  ],
  leadership: [
    { to: '/leadership/roi-analytics', icon: ShieldCheck, label: 'Leadership API' },
    { to: '/audit-logs', icon: ShieldCheck, label: 'Audit Logs' },
  ],
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { refreshData, employees } = useEmployees();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const insightsEmployeeId = employees[0]?.id ?? 'emp-123';
  const canSeeInsights = user?.role === 'manager' || user?.role === 'hr';
  const insightsNav = canSeeInsights
    ? [{ to: `/insights/${insightsEmployeeId}`, icon: Brain, label: 'AI Insights' }]
    : [];

  const navItems = [
    ...CORE_NAV_ITEMS,
    ...insightsNav,
    ...(user ? ROLE_NAV_ITEMS[user.role] : []),
  ];

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r-2 border-foreground bg-card transition-transform duration-200 lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center gap-3 border-b-2 border-foreground px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center border-2 border-foreground bg-primary shadow-[2px_2px_0px_#000]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold font-heading text-foreground">NOVA</h1>
            <p className="text-xs text-muted-foreground">AI-Powered HR Analytics</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <item.icon className="h-4.5 w-4.5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t-2 border-foreground p-3 space-y-2">
          {user && (
            <div className="px-2 py-2 border-2 border-foreground bg-muted text-xs">
              <p className="font-bold truncate">{user.full_name}</p>
              <p className="text-muted-foreground truncate">{user.email}</p>
              <p className="font-semibold uppercase mt-1">Role: {user.role}</p>
            </div>
          )}

          <button
            onClick={refreshData}
            className="sidebar-link w-full justify-center gap-2 hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Regenerate Demo Data</span>
          </button>

          <button
            onClick={() => {
              void logout();
            }}
            className="sidebar-link w-full justify-center gap-2 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b-2 border-foreground bg-card px-4 py-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-bold font-heading">
              {navItems.find(i => i.to === location.pathname)?.label || 'Employee Insights'}
            </h2>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
