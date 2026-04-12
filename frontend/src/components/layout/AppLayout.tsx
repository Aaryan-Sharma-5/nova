import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquare, Brain, RefreshCw, Menu, X, HeartPulse, ShieldCheck, UserCircle, LogOut, CalendarClock, Settings2, Code2, BriefcaseBusiness, LineChart, FileText } from 'lucide-react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth';
import { Badge } from '@/components/ui/badge';
import { protectedGetApi, protectedPostApi } from '@/lib/api';

const CORE_NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/sentiment', icon: MessageSquare, label: 'Sentiment Analyzer' },
  { to: '/org-health', icon: HeartPulse, label: 'Org Wellbeing' },
  { to: '/employee/profile', icon: UserCircle, label: 'My Backend Profile' },
];

type NavItem = { to: string; icon: typeof ShieldCheck; label: string; badgeCount?: number };

const ROLE_NAV_ITEMS: Record<UserRole, Array<{ to: string; icon: typeof ShieldCheck; label: string }>> = {
  employee: [
    { to: '/your-data', icon: UserCircle, label: 'Your Data' },
  ],
  manager: [
    { to: '/manager/team-alerts', icon: BriefcaseBusiness, label: 'Manager API' },
  ],
  hr: [
    { to: '/hr/org-risk-distribution', icon: Code2, label: 'HR API' },
    { to: '/hr/sessions-schedule', icon: CalendarClock, label: 'Schedule Sessions' },
    { to: '/hr/sessions-review', icon: ShieldCheck, label: 'Sessions to Review' },
    { to: '/integrations', icon: Settings2, label: 'Integrations' },
  ],
  leadership: [
    { to: '/leadership/roi-analytics', icon: LineChart, label: 'Leadership API' },
    { to: '/hr/sessions-schedule', icon: CalendarClock, label: 'Schedule Sessions' },
    { to: '/hr/sessions-review', icon: ShieldCheck, label: 'Sessions to Review' },
    { to: '/audit-logs', icon: FileText, label: 'Audit Logs' },
    { to: '/integrations', icon: Settings2, label: 'Integrations' },
  ],
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { refreshData, employees } = useEmployees();
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingSessionReviewCount, setPendingSessionReviewCount] = useState(0);
  const [upcomingSessionCount, setUpcomingSessionCount] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const insightsEmployeeId = employees[0]?.id ?? 'emp-123';
  const canSeeInsights = user?.role === 'manager' || user?.role === 'hr';
  const insightsNav = canSeeInsights
    ? [{ to: `/insights/${insightsEmployeeId}`, icon: Brain, label: 'AI Insights' }]
    : [];

  const navItems = [
    ...CORE_NAV_ITEMS,
    ...insightsNav,
    ...(user ? ROLE_NAV_ITEMS[user.role] : []),
  ] as NavItem[];

  useEffect(() => {
    const loadPendingCount = async () => {
      if (!token || (user?.role !== 'hr' && user?.role !== 'leadership')) {
        setPendingSessionReviewCount(0);
        setUpcomingSessionCount(0);
        return;
      }

      try {
        const payload = await protectedGetApi<{ count?: number; sessions?: Array<{ scheduled_date?: string; status?: string }> }>('/api/feedback/sessions/pending-review', token);
        const sessions = payload?.sessions ?? [];
        setPendingSessionReviewCount(Number(payload?.count ?? sessions.length ?? 0));

        const now = new Date();
        const next7 = new Date(now);
        next7.setDate(now.getDate() + 7);
        const upcoming = sessions.filter((session) => {
          const status = (session.status || '').toLowerCase();
          if (status !== 'scheduled' && status !== 'in_progress') return false;
          const dt = session.scheduled_date ? new Date(session.scheduled_date) : null;
          return Boolean(dt && dt >= now && dt <= next7);
        }).length;
        setUpcomingSessionCount(upcoming);
      } catch {
        setPendingSessionReviewCount(0);
        setUpcomingSessionCount(0);
      }
    };

    void loadPendingCount();

    const intervalId = window.setInterval(() => {
      void loadPendingCount();
    }, 60000);

    const onFocus = () => {
      void loadPendingCount();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, user?.role]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as any);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const navItemsWithBadges = useMemo(() => (
    navItems.map((item) => {
      if (item.to === '/hr/sessions-review') {
        return { ...item, badgeCount: pendingSessionReviewCount };
      }
      if (item.to === '/hr/sessions-schedule') {
        return { ...item, badgeCount: upcomingSessionCount };
      }
      return item;
    })
  ), [navItems, pendingSessionReviewCount, upcomingSessionCount]);

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
          {navItemsWithBadges.map(item => (
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
              {item.badgeCount !== undefined && item.badgeCount > 0 && (
                <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                  {item.badgeCount}
                </Badge>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t-2 border-foreground p-3 space-y-2">
          {user && (
            <div className="px-2 py-2 border-2 border-foreground bg-muted text-xs">
              <div className="flex items-center gap-2">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.full_name}
                    className="h-8 w-8 rounded-full border border-foreground object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full border border-foreground bg-background flex items-center justify-center font-bold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold truncate">{user.full_name}</p>
                  <p className="text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
              <p className="font-semibold uppercase mt-1">Role: {user.role}</p>
            </div>
          )}

          <button
            onClick={async () => {
              refreshData();
              if (token) {
                try {
                  await protectedPostApi('/api/feedback/sessions/seed-demo', token, {});
                } catch {
                  // Non-fatal: local UI regen still succeeds.
                }
              }
            }}
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
              {navItemsWithBadges.find(i => i.to === location.pathname)?.label || 'Employee Insights'}
            </h2>
          </div>
          {user && (
            <div className="flex items-center gap-2 rounded-full border border-foreground px-2 py-1">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline text-xs font-medium max-w-[160px] truncate">{user.full_name}</span>
            </div>
          )}
        </header>

        {deferredPrompt && (
          <div className="mx-4 mt-3 rounded border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs flex items-center justify-between gap-2 lg:hidden">
            <span>Install NOVA for a faster mobile experience.</span>
            <Button
              size="sm"
              onClick={async () => {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                setDeferredPrompt(null);
              }}
            >
              Install
            </Button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>

        <nav className="fixed bottom-0 inset-x-0 z-30 border-t-2 border-foreground bg-card p-2 lg:hidden">
          <div className="grid grid-cols-4 gap-2 text-xs">
            <NavLink to="/" className="text-center py-2 rounded border border-transparent hover:border-foreground">Home</NavLink>
            <NavLink to="/employees" className="text-center py-2 rounded border border-transparent hover:border-foreground">Alerts</NavLink>
            <NavLink to="/feedback-session" className="text-center py-2 rounded border border-transparent hover:border-foreground">Feedback</NavLink>
            <NavLink to="/your-data" className="text-center py-2 rounded border border-transparent hover:border-foreground">Profile</NavLink>
          </div>
        </nav>
      </div>
    </div>
  );
}
