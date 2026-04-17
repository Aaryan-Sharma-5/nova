import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { EmployeeProvider } from "@/contexts/EmployeeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { lazy, Suspense } from "react";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const SentimentPage = lazy(() => import("./pages/SentimentPage"));
const OrgHealthPage = lazy(() => import("./pages/OrgHealthPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const HrApiPage = lazy(() => import("./pages/HrApiPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const BackendEndpointPage = lazy(() => import("./pages/BackendEndpointPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const EmployeePersonalPage = lazy(() => import("./pages/EmployeePersonalPage"));
const FeedbackSessionPage = lazy(() => import("./pages/FeedbackSessionPage"));
const HRSessionsReviewPage = lazy(() => import("./pages/HRSessionsReviewPage"));
const HRSessionsSchedulerPage = lazy(() => import("./pages/HRSessionsSchedulerPage"));
const HRFeedbackPage = lazy(() => import("./pages/HRFeedbackPage"));
const AppraisalPage = lazy(() => import("./pages/AppraisalPage"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage"));
const TaskAssignmentsPage = lazy(() => import("./pages/TaskAssignmentsPage"));
const JobBoardPage = lazy(() => import("./pages/JobBoardPage"));
const WorkProfilesPage = lazy(() => import("./pages/WorkProfilesPage"));
const EmployeeProfilePage = lazy(() => import("./pages/EmployeeProfilePage"));
const CareersPage = lazy(() => import("./pages/CareersPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InsightsDashboard = lazy(() => import("@/features/insights/InsightsDashboard").then((module) => ({ default: module.InsightsDashboard })));
const AnomaliesPage = lazy(() => import("./pages/AnomaliesPage"));
const DeptHeatmapPage = lazy(() => import("./pages/DeptHeatmapPage"));
const VoiceAssistant = lazyWithRetry(() => import("@/components/voice/VoiceAssistant"), "voice-assistant");

const queryClient = new QueryClient();

function RoleHomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'employee') return <Navigate to="/your-data" replace />;
  return <Navigate to="/org-health" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <EmployeeProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/hr-api" element={<HrApiPage />} />
                <Route path="/forbidden" element={<ForbiddenPage />} />
                <Route path="/careers" element={<CareersPage />} />

                <Route
                  path="/home"
                  element={
                    <ProtectedRoute>
                      <RoleHomeRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <AppLayout>
                        <DashboardPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/employees"
                  element={
                    <ProtectedRoute allowedRoles={["manager", "hr", "leadership"]}>
                      <AppLayout>
                        <EmployeesPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
              <Route
                path="/sentiment"
                element={
                  <ProtectedRoute allowedRoles={["manager", "hr", "leadership"]}>
                    <AppLayout>
                      <SentimentPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/org-health"
                element={
                  <ProtectedRoute allowedRoles={["manager", "hr", "leadership"]}>
                    <AppLayout>
                      <OrgHealthPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/your-data"
                element={
                  <ProtectedRoute allowedRoles={["employee"]}>
                    <AppLayout>
                      <EmployeePersonalPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/feedback-session"
                element={
                  <ProtectedRoute allowedRoles={["employee"]}>
                    <AppLayout>
                      <FeedbackSessionPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/feedback/session/:sessionId"
                element={
                  <ProtectedRoute allowedRoles={["employee"]}>
                    <AppLayout>
                      <FeedbackSessionPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/sessions-review"
                element={
                  <ProtectedRoute allowedRoles={["hr"]}>
                    <AppLayout>
                      <HRSessionsReviewPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/sessions-schedule"
                element={
                  <ProtectedRoute allowedRoles={["hr"]}>
                    <AppLayout>
                      <HRSessionsSchedulerPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/feedback-analyzer"
                element={
                  <ProtectedRoute allowedRoles={["hr"]}>
                    <AppLayout>
                      <HRFeedbackPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/appraisals"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership"]}>
                    <AppLayout>
                      <AppraisalPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/integrations"
                element={
                  <ProtectedRoute allowedRoles={["hr"]}>
                    <AppLayout>
                      <IntegrationsPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/task-assignments"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership"]}>
                    <AppLayout>
                      <TaskAssignmentsPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/job-board"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership"]}>
                    <AppLayout>
                      <JobBoardPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/work-profiles"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <WorkProfilesPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/employees/:employeeId/profile"
                element={
                  <ProtectedRoute allowedRoles={["manager", "hr", "leadership"]}>
                    <AppLayout>
                      <EmployeeProfilePage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/insights/:employeeId"
                element={
                  <ProtectedRoute allowedRoles={["hr", "manager"]}>
                    <AppLayout>
                      <InsightsDashboard />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/departments/heatmap"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership"]}>
                    <AppLayout>
                      <DeptHeatmapPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/anomalies"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership", "manager"]}>
                    <AppLayout>
                      <AnomaliesPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/employee/profile"
                element={
                  <ProtectedRoute allowedRoles={["employee"]}>
                    <AppLayout>
                      <BackendEndpointPage
                        title="Employee Profile"
                        endpoint="/employee/profile"
                        description="Any authenticated role can access this endpoint."
                      />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manager/team-alerts"
                element={
                  <ProtectedRoute allowedRoles={["manager"]}>
                    <AppLayout>
                      <BackendEndpointPage
                        title="Manager Team Alerts"
                        endpoint="/manager/team-alerts"
                        description="Manager-only team alert feed from backend RBAC route."
                      />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leadership/roi-analytics"
                element={
                  <ProtectedRoute allowedRoles={["leadership"]}>
                    <AppLayout>
                      <BackendEndpointPage
                        title="Leadership ROI Analytics"
                        endpoint="/leadership/roi-analytics"
                        description="Leadership-only strategic ROI metrics from backend."
                      />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership"]}>
                    <AppLayout>
                      <AuditLogPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="*"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <NotFound />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              </Routes>
              <VoiceAssistant />
            </Suspense>
          </BrowserRouter>
        </EmployeeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Loading NOVA...
    </div>
  );
}

export default App;
