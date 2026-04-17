import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  MessageSquareText,
  Brain,
  Menu,
  X,
  HeartPulse,
  ShieldCheck,
  UserCircle,
  LogOut,
  CalendarClock,
  Settings2,
  LineChart,
  FileText,
  AlertTriangle,
  ClipboardList,
  Home,
  LayoutGrid,
  Network,
  GitCommit,
  Briefcase,
  ListChecks,
} from 'lucide-react';
import { useEmployees } from '@/contexts/EmployeeContext';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth';
import { Badge } from '@/components/ui/badge';
import { protectedGetApi } from '@/lib/api';

type NavItem = {
  to: string;
  icon: typeof ShieldCheck;
  label: string;
  badgeCount?: number;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const ROLE_HOME_PATH: Record<UserRole, string> = {
  employee: '/',
  manager: '/org-health',
  hr: '/org-health',
  leadership: '/org-health',
};

function getRoleHomePath(role: UserRole): string {
  return ROLE_HOME_PATH[role] ?? '/org-health';
}

function resolvePageTitle(pathname: string, navItems: NavItem[], role?: UserRole): string {
  if (pathname === '/dashboard') {
    if (role === 'manager') return 'Dashboard';
    if (role === 'hr') return 'Dashboard';
    if (role === 'leadership') return 'Executive Pulse';
  }
  if (pathname === '/') {
    if (role === 'employee') return 'Home';
  }

  const exact = navItems.find((item) => item.to === pathname);
  if (exact) {
    return exact.label;
  }

  if (pathname.startsWith('/insights/')) return 'AI Insights';
  if (pathname.startsWith('/employees/') && pathname.endsWith('/profile')) return 'Employee Profile';
  if (pathname.startsWith('/feedback/session/')) return 'Feedback Session';

  const prefixed = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => item.to !== '/' && pathname.startsWith(item.to));
  if (prefixed) {
    return prefixed.label;
  }

  return 'NOVA Workspace';
}

function buildNavSections(role: UserRole, insightsEmployeeId: string): NavSection[] {
  switch (role) {
    case 'manager':
      return [
        {
          title: 'Overview',
          items: [
            { to: '/org-health', icon: HeartPulse, label: 'Org Wellbeing' },
            { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          ],
        },
        {
          title: 'My Team',
          items: [
            { to: '/employees', icon: Users, label: 'Team Roster' },
            { to: '/employees/org-tree', icon: Network, label: '↳ Org Tree' },
            { to: '/sentiment', icon: MessageSquare, label: 'Team Sentiment' },
            { to: `/insights/${insightsEmployeeId}`, icon: Brain, label: 'AI Insights' },
            { to: '/anomalies', icon: AlertTriangle, label: 'Risk Alerts' },
          ],
        },
      ];

    case 'hr':
      return [
        {
          title: 'Workspace',
          items: [
            { to: '/org-health', icon: HeartPulse, label: 'Org Wellbeing' },
            { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { to: '/employees', icon: Users, label: 'Employees' },
            { to: '/departments/heatmap', icon: LayoutGrid, label: 'Dept Heatmap' },
            { to: '/hr/feedback-analyzer', icon: MessageSquareText, label: 'Feedback Analyzer' },
            { to: '/hr/appraisals', icon: ClipboardList, label: 'Appraisals' },
            { to: '/sentiment', icon: MessageSquare, label: 'Sentiment Analyzer' },
            { to: `/insights/${insightsEmployeeId}`, icon: Brain, label: 'AI Insights' },
            { to: '/employees/org-tree', icon: Network, label: '↳ Org Tree' },
            { to: '/hr/sessions-schedule', icon: CalendarClock, label: 'Schedule Sessions' },
            { to: '/hr/sessions-review', icon: ClipboardList, label: 'Sessions to Review' },
            { to: '/integrations', icon: Settings2, label: 'Integrations' },
          ],
        },
        {
          title: 'Talent Pipeline',
          items: [
            { to: '/task-assignments', icon: ListChecks, label: 'Task Assignments' },
            { to: '/job-board', icon: Briefcase, label: 'Job Board' },
            { to: '/work-profiles', icon: GitCommit, label: 'Work Profiles' },
          ],
        },
        {
          title: 'Admin',
          items: [
            { to: '/anomalies', icon: AlertTriangle, label: 'Anomaly Alerts' },
            { to: '/audit-logs', icon: FileText, label: 'Audit Logs' },
          ],
        },
      ];

    case 'leadership':
      return [
        {
          title: 'Overview',
          items: [
            { to: '/org-health', icon: HeartPulse, label: 'Org Wellbeing' },
            { to: '/dashboard', icon: LayoutDashboard, label: 'Executive Pulse' },
          ],
        },
        {
          title: 'Analytics',
          items: [
            { to: '/employees', icon: Users, label: 'Workforce' },
            { to: '/employees/org-tree', icon: Network, label: '↳ Org Tree' },
            { to: '/departments/heatmap', icon: LayoutGrid, label: 'Dept Heatmap' },
            { to: '/sentiment', icon: MessageSquare, label: 'Sentiment Analyzer' },
            { to: '/hr/appraisals', icon: ClipboardList, label: 'Appraisals' },
            { to: '/anomalies', icon: AlertTriangle, label: 'Anomaly Alerts' },
            { to: '/leadership/roi-analytics', icon: LineChart, label: 'ROI Analytics' },
          ],
        },
        {
          title: 'Governance',
          items: [
            { to: '/audit-logs', icon: FileText, label: 'Audit Logs' },
          ],
        },
      ];

    case 'employee':
      return [
        {
          title: 'My Workspace',
          items: [
            { to: '/', icon: Home, label: 'Home' },
            { to: '/your-data', icon: UserCircle, label: 'Your Data' },
            { to: '/employees/org-tree', icon: Network, label: 'Org Tree' },
            { to: '/feedback-session', icon: MessageSquare, label: 'Feedback Session' },
            { to: '/work-profiles', icon: GitCommit, label: 'My Work Profile' },
            { to: '/employee/profile', icon: ShieldCheck, label: 'Privacy & Profile' },
          ],
        },
      ];

    default:
      return [];
  }
}

function buildMobileBottomNav(role: UserRole): NavItem[] {
  switch (role) {
    case 'manager':
      return [
        { to: '/org-health', icon: Home, label: 'Home' },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/employees', icon: Users, label: 'Team' },
        { to: '/anomalies', icon: AlertTriangle, label: 'Alerts' },
      ];
    case 'hr':
      return [
        { to: '/org-health', icon: Home, label: 'Home' },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/employees', icon: Users, label: 'People' },
        { to: '/hr/sessions-review', icon: ClipboardList, label: 'Sessions' },
      ];
    case 'leadership':
      return [
        { to: '/org-health', icon: Home, label: 'Home' },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/anomalies', icon: AlertTriangle, label: 'Alerts' },
        { to: '/audit-logs', icon: FileText, label: 'Audit' },
      ];
    case 'employee':
      return [
        { to: '/', icon: Home, label: 'Home' },
        { to: '/feedback-session', icon: MessageSquare, label: 'Feedback' },
        { to: '/employee/profile', icon: UserCircle, label: 'Profile' },
      ];
    default:
      return [];
  }
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { employees } = useEmployees();
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingSessionReviewCount, setPendingSessionReviewCount] = useState(0);
  const [upcomingSessionCount, setUpcomingSessionCount] = useState(0);
  const [draftAppraisalCount, setDraftAppraisalCount] = useState(0);
  const [pendingAssignmentCount, setPendingAssignmentCount] = useState(0);
  const [pendingJobCount, setPendingJobCount] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const insightsEmployeeId = employees[0]?.id ?? 'emp-123';

  const navSections = useMemo<NavSection[]>(() => {
    if (!user) return [];
    return buildNavSections(user.role, insightsEmployeeId);
  }, [user, insightsEmployeeId]);

  const mobileNav = useMemo<NavItem[]>(() => {
    if (!user) return [];
    return buildMobileBottomNav(user.role);
  }, [user]);

  useEffect(() => {
    const loadPendingCount = async () => {
      if (!token || !user?.role) {
        setPendingSessionReviewCount(0);
        setUpcomingSessionCount(0);
        setDraftAppraisalCount(0);
        return;
      }

      if (user.role === 'hr') {
        try {
          const payload = await protectedGetApi<{
            count?: number;
            sessions?: Array<{ scheduled_date?: string; status?: string }>;
          }>('/api/feedback/sessions/pending-review', token);
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
      } else {
        setPendingSessionReviewCount(0);
        setUpcomingSessionCount(0);
      }

      if (user.role === 'hr' || user.role === 'leadership') {
        try {
          const summary = await protectedGetApi<{ draft_count?: number }>('/api/appraisals/summary', token);
          setDraftAppraisalCount(Number(summary?.draft_count ?? 0));
        } catch {
          setDraftAppraisalCount(0);
        }

        try {
          const ac = await protectedGetApi<{ count?: number }>('/api/task-assignments/pending-count', token);
          setPendingAssignmentCount(Number(ac?.count ?? 0));
        } catch {
          setPendingAssignmentCount(0);
        }

        try {
          const jc = await protectedGetApi<{ count?: number }>('/api/job-board/limbo-count', token);
          setPendingJobCount(Number(jc?.count ?? 0));
        } catch {
          setPendingJobCount(0);
        }
      } else {
        setDraftAppraisalCount(0);
        setPendingAssignmentCount(0);
        setPendingJobCount(0);
      }
    };

    void loadPendingCount();
    const intervalId = window.setInterval(() => void loadPendingCount(), 60000);
    const onFocus = () => void loadPendingCount();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, user?.role]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as Partial<BeforeInstallPromptEvent>;
      if (typeof promptEvent.prompt === 'function' && promptEvent.userChoice) {
        setDeferredPrompt(promptEvent as BeforeInstallPromptEvent);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const navSectionsWithBadges = useMemo<NavSection[]>(() => {
    return navSections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.to === '/hr/sessions-review') {
          return { ...item, badgeCount: pendingSessionReviewCount };
        }
        if (item.to === '/hr/sessions-schedule') {
          return { ...item, badgeCount: upcomingSessionCount };
        }
        if (item.to === '/hr/appraisals') {
          return { ...item, badgeCount: draftAppraisalCount };
        }
        if (item.to === '/task-assignments') {
          return { ...item, badgeCount: pendingAssignmentCount };
        }
        if (item.to === '/job-board') {
          return { ...item, badgeCount: pendingJobCount };
        }
        return item;
      }),
    }));
  }, [navSections, pendingSessionReviewCount, upcomingSessionCount, draftAppraisalCount, pendingAssignmentCount, pendingJobCount]);

  const flatItemsForHeader = useMemo(() => navSectionsWithBadges.flatMap((s) => s.items), [
    navSectionsWithBadges,
  ]);

  const homePath = user ? getRoleHomePath(user.role) : '/';

  const pageTitle = useMemo(() => {
    return resolvePageTitle(location.pathname, flatItemsForHeader, user?.role);
  }, [location.pathname, flatItemsForHeader, user?.role]);

  return (
    <div className="flex min-h-screen w-full">

      <aside
        className={`app-sidebar group fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-hidden border-r-2 border-foreground bg-card transition-transform duration-200 lg:sticky lg:top-0 lg:w-[84px] lg:overflow-hidden lg:translate-x-0 lg:transition-[width] lg:duration-200 lg:hover:w-64 lg:focus-within:w-64 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b-2 border-foreground px-2 py-2 lg:h-16 lg:justify-center lg:px-0 lg:py-0 lg:group-hover:h-auto lg:group-hover:justify-start lg:group-hover:px-2 lg:group-hover:py-2 lg:group-focus-within:h-auto lg:group-focus-within:justify-start lg:group-focus-within:px-2 lg:group-focus-within:py-2">
          <NavLink
            to={homePath}
            end
            onClick={() => setSidebarOpen(false)}
            className="flex min-w-0 items-center gap-3 px-3 py-2.5 lg:h-11 lg:w-11 lg:justify-center lg:gap-0 lg:px-0 lg:py-0 lg:group-hover:h-auto lg:group-hover:w-full lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-3 lg:group-hover:py-2.5 lg:group-focus-within:h-auto lg:group-focus-within:w-full lg:group-focus-within:justify-start lg:group-focus-within:gap-3 lg:group-focus-within:px-3 lg:group-focus-within:py-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-primary shadow-none lg:group-hover:shadow-[2px_2px_0px_#000] lg:group-focus-within:shadow-[2px_2px_0px_#000]">
              <Brain className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0 overflow-hidden transition-all duration-200 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[10rem] lg:group-hover:opacity-100 lg:group-focus-within:max-w-[10rem] lg:group-focus-within:opacity-100">
              <h1 className="text-sm font-bold font-heading text-foreground">NOVA</h1>
              <p className="text-xs text-muted-foreground truncate">AI Workforce Pulse</p>
            </div>
          </NavLink>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        <nav className="flex-1 overflow-hidden p-2">
          {navSectionsWithBadges.map((section) => (
            <div
              key={section.title}
              className="space-y-1"
            >
              <p className="overflow-hidden px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-all duration-200 lg:max-h-0 lg:opacity-0 lg:group-hover:max-h-6 lg:group-hover:opacity-100 lg:group-focus-within:max-h-6 lg:group-focus-within:opacity-100">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setSidebarOpen(false)}
                  title={item.label}
                  className={({ isActive }) =>
                    `sidebar-link lg:mx-auto lg:h-11 lg:w-11 lg:justify-center lg:gap-0 lg:px-0 lg:py-0 lg:group-hover:mx-0 lg:group-hover:h-auto lg:group-hover:w-full lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-3 lg:group-hover:py-2.5 lg:group-focus-within:mx-0 lg:group-focus-within:h-auto lg:group-focus-within:w-full lg:group-focus-within:justify-start lg:group-focus-within:gap-3 lg:group-focus-within:px-3 lg:group-focus-within:py-2.5 ${isActive ? 'sidebar-link-active' : ''}`
                  }
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <item.icon className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="overflow-hidden whitespace-nowrap transition-all duration-200 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[10rem] lg:group-hover:opacity-100 lg:group-focus-within:max-w-[10rem] lg:group-focus-within:opacity-100">
                    {item.label}
                  </span>
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-auto overflow-hidden text-[10px] transition-all duration-200 lg:max-w-0 lg:px-0 lg:opacity-0 lg:group-hover:max-w-8 lg:group-hover:px-1.5 lg:group-hover:opacity-100 lg:group-focus-within:max-w-8 lg:group-focus-within:px-1.5 lg:group-focus-within:opacity-100"
                    >
                      {item.badgeCount}
                    </Badge>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center gap-3 border-b-2 border-foreground bg-card px-4 py-3 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-bold font-heading">{pageTitle}</h2>
          </div>
          {user && (
            <div className="flex items-center gap-2 border-2 border-foreground bg-card px-2 py-1 shadow-[2px_2px_0px_#000]">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="h-6 w-6 border border-foreground object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center border border-foreground bg-primary text-[10px] font-bold text-primary-foreground">
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline max-w-[140px] truncate text-xs font-bold">
                {user.full_name}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-1 border-2 border-foreground bg-[#FFE500] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[2px_2px_0px_#000]"
              >
                <LogOut className="h-3 w-3" />
                <span className="hidden sm:inline">Logout</span>
              </button>
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

        <main className="flex-1 overflow-auto p-4 lg:p-6 pb-20 lg:pb-6 nova-page-fade">
          <div className="mx-auto w-full max-w-[1500px] space-y-4">{children}</div>
        </main>

        {mobileNav.length > 0 && (
          <nav className="fixed bottom-0 inset-x-0 z-30 border-t-2 border-foreground bg-card p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
            <div
              className={`grid gap-2 text-[11px] ${
                mobileNav.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
              }`}
            >
              {mobileNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/' || item.to === '/your-data'}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-2 border-2 ${
                      isActive
                        ? 'border-foreground bg-[#FFE500] shadow-[2px_2px_0px_#000]'
                        : 'border-transparent hover:border-foreground'
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span className="font-bold uppercase tracking-wider mt-0.5">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
