import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { EmployeeProvider } from "@/contexts/EmployeeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import EmployeesPage from "./pages/EmployeesPage";
import SentimentPage from "./pages/SentimentPage";
import OrgHealthPage from "./pages/OrgHealthPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForbiddenPage from "./pages/ForbiddenPage";
import BackendEndpointPage from "./pages/BackendEndpointPage";
import AuditLogPage from "./pages/AuditLogPage";
import EmployeePersonalPage from "./pages/EmployeePersonalPage";
import FeedbackSessionPage from "./pages/FeedbackSessionPage";
import HRSessionsReviewPage from "./pages/HRSessionsReviewPage";
import NotFound from "./pages/NotFound";
import { InsightsDashboard } from "@/features/insights/InsightsDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <EmployeeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forbidden" element={<ForbiddenPage />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute allowedRoles={["manager", "hr", "leadership"]}>
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
                path="/hr/sessions-review"
                element={
                  <ProtectedRoute allowedRoles={["hr", "leadership"]}>
                    <AppLayout>
                      <HRSessionsReviewPage />
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
                path="/hr/org-risk-distribution"
                element={
                  <ProtectedRoute allowedRoles={["hr"]}>
                    <AppLayout>
                      <BackendEndpointPage
                        title="HR Org Risk Distribution"
                        endpoint="/hr/org-risk-distribution"
                        description="HR-only backend endpoint wired through frontend auth token."
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
                  <ProtectedRoute allowedRoles={["leadership"]}>
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
          </BrowserRouter>
        </EmployeeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
