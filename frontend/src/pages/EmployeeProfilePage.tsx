import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmployees } from "@/contexts/EmployeeContext";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import ScoreExplanationDrawer from "@/components/explainability/ScoreExplanationDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi, protectedPostApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { AppraisalSuggestion } from "@/types/appraisal";

type EmployeeDetailResponse = {
  employee_id: string;
  name: string;
  department: string;
  role: string;
  attendance_rate: number;
  avg_weekly_hours: number;
  leaves_taken_30d: number;
  kpi_score: number;
  last_1on1_days_ago: number;
  feedback_submissions_count: number;
  after_hours_sessions_weekly: number;
  tenure_days: number;
  data_quality_score: number;
  data_quality_fields: string[];
};

function scoreColor(value: number): string {
  if (value >= 70) return "text-red-600";
  if (value >= 40) return "text-amber-600";
  return "text-green-600";
}

export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { getEmployee } = useEmployees();
  const { token, hasRole } = useAuth();
  const navigate = useNavigate();
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [latestAppraisal, setLatestAppraisal] = useState<AppraisalSuggestion | null>(null);
  const [appraisalLoading, setAppraisalLoading] = useState(false);
  const [appraisalError, setAppraisalError] = useState<string | null>(null);

  const employee = employeeId ? getEmployee(employeeId) : undefined;

  useEffect(() => {
    const loadDetail = async () => {
      if (!employeeId || !token) {
        setEmployeeDetail(null);
        return;
      }

      setDetailLoading(true);
      try {
        const payload = await protectedGetApi<EmployeeDetailResponse>(`/api/employees/${employeeId}`, token);
        setEmployeeDetail(payload);
      } catch {
        setEmployeeDetail(null);
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [employeeId, token]);

  useEffect(() => {
    const loadLatestAppraisal = async () => {
      if (!employeeId || !token || !hasRole(["hr", "leadership"])) {
        setLatestAppraisal(null);
        setAppraisalError(null);
        return;
      }

      setAppraisalLoading(true);
      setAppraisalError(null);
      try {
        const payload = await protectedGetApi<AppraisalSuggestion>(`/api/appraisals/suggestions/${employeeId}/latest`, token);
        setLatestAppraisal(payload);
      } catch (error) {
        setLatestAppraisal(null);
        setAppraisalError(error instanceof Error ? error.message : "No appraisal suggestion yet");
      } finally {
        setAppraisalLoading(false);
      }
    };

    void loadLatestAppraisal();
  }, [employeeId, token, hasRole]);

  const handleGenerateAppraisal = async () => {
    if (!employeeId || !token) return;
    setAppraisalLoading(true);
    setAppraisalError(null);
    try {
      const generated = await protectedPostApi<AppraisalSuggestion>(`/api/appraisals/generate/${employeeId}`, token, {});
      setLatestAppraisal(generated);
    } catch (error) {
      setAppraisalError(error instanceof Error ? error.message : "Unable to generate appraisal");
    } finally {
      setAppraisalLoading(false);
    }
  };

  const overview = useMemo(() => {
    if (!employee) return [];
    return [
      { label: "Burnout Risk", value: employee.burnoutRisk, trend: employee.performanceHistory },
      { label: "Engagement Score", value: employee.engagementScore, trend: employee.performanceHistory },
      { label: "Sentiment Trend", value: Math.round((employee.sentimentScore + 1) * 50), trend: employee.sentimentHistory },
      { label: "Flight Risk", value: employee.attritionRisk, trend: employee.performanceHistory },
    ];
  }, [employee]);

  if (!employee) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Employee profile not found</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/employees")}>Back to Employees</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => navigate("/employees")}>← All Employees</Button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                {employee.name.split(" ").map((part) => part[0]).join("")}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{employee.name}</h1>
                <p className="text-sm text-muted-foreground">{employee.role} · {employee.department}</p>
                <p className="text-sm text-muted-foreground">{employee.email} · {employee.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{employee.tenure} months</Badge>
              {employee.tenure < 3 && <Badge variant="secondary">Onboarding</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data-sources">Data Sources</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="jira">Jira Signals</TabsTrigger>
          <TabsTrigger value="interventions">Interventions</TabsTrigger>
          <TabsTrigger value="sessions">Feedback Sessions</TabsTrigger>
          <TabsTrigger value="appraisal">Appraisal</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <ScoreExplanationDrawer employeeId={employee.id} scoreType="burnout" />
                  </div>
                  <p className={`text-3xl font-bold ${scoreColor(item.value)}`}>{item.value}</p>
                  <div className="h-20">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={item.trend}>
                        <XAxis dataKey="date" hide />
                        <YAxis hide />
                        <Tooltip />
                        <Line dataKey="score" stroke="#0ea5e9" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="data-sources">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Data Sources & Parameters</span>
                {detailLoading ? (
                  <Skeleton className="h-5 w-20" />
                ) : (
                  <Badge
                    className={
                      (employeeDetail?.data_quality_score ?? 0) >= 80
                        ? "bg-emerald-100 text-emerald-800"
                        : (employeeDetail?.data_quality_score ?? 0) >= 50
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }
                  >
                    {employeeDetail ? `${employeeDetail.data_quality_score}%` : `${employee.dataQualityScore ?? 0}%`}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detailLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}

              {!detailLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded border p-3">Attendance rate: <span className="font-semibold">{Math.round((employeeDetail?.attendance_rate ?? employee.attendanceRate ?? 0) * 100)}%</span></div>
                  <div className="rounded border p-3">Avg weekly hours: <span className="font-semibold">{employeeDetail?.avg_weekly_hours ?? employee.avgWeeklyHours ?? employee.workHoursPerWeek}</span></div>
                  <div className="rounded border p-3">Leaves (30d): <span className="font-semibold">{employeeDetail?.leaves_taken_30d ?? employee.leavesTaken30d ?? 0}</span></div>
                  <div className="rounded border p-3">KPI score: <span className="font-semibold">{Math.round((employeeDetail?.kpi_score ?? employee.kpiScore ?? employee.performanceScore / 100) * 100)}%</span></div>
                  <div className="rounded border p-3">Days since last 1:1: <span className="font-semibold">{employeeDetail?.last_1on1_days_ago ?? employee.lastOneOnOneDaysAgo ?? '-'}</span></div>
                  <div className="rounded border p-3">Feedback submissions: <span className="font-semibold">{employeeDetail?.feedback_submissions_count ?? employee.feedbackSubmissionsCount ?? 0}</span></div>
                  <div className="rounded border p-3">After-hours sessions weekly: <span className="font-semibold">{employeeDetail?.after_hours_sessions_weekly ?? employee.afterHoursSessionsWeekly ?? 0}</span></div>
                  <div className="rounded border p-3">Tenure days: <span className="font-semibold">{employeeDetail?.tenure_days ?? employee.tenureDays ?? employee.tenure * 30}</span></div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Events from meetings, recognitions, sentiment shifts, and interventions are available in employee side panel timeline and connected APIs.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jira">
          <Card>
            <CardHeader><CardTitle>Jira Signals</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Integration not connected.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interventions">
          <Card>
            <CardHeader><CardTitle>Interventions</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Pending and completed interventions are available via interventions APIs.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader><CardTitle>Feedback Sessions</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Session schedule/review status is shown in the employee dashboard and sessions APIs.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appraisal">
          <Card>
            <CardHeader>
              <CardTitle>Appraisal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!hasRole(["hr", "leadership"]) && (
                <p className="text-sm text-muted-foreground">Appraisal actions are available to HR and Leadership roles.</p>
              )}

              {hasRole(["hr", "leadership"]) && appraisalLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}

              {hasRole(["hr", "leadership"]) && !appraisalLoading && !latestAppraisal && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">No appraisal suggestion exists for this employee yet.</p>
                  {appraisalError && <p className="text-xs text-muted-foreground">{appraisalError}</p>}
                  <Button onClick={() => void handleGenerateAppraisal()}>Generate Appraisal</Button>
                </div>
              )}

              {hasRole(["hr", "leadership"]) && !appraisalLoading && latestAppraisal && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{latestAppraisal.status}</Badge>
                    <Badge>{Math.round(latestAppraisal.composite_score)} score</Badge>
                    <Badge>{latestAppraisal.category}</Badge>
                  </div>

                  {latestAppraisal.status === "finalized" && latestAppraisal.hr_decision && (
                    <div className="rounded border-l-4 border-emerald-500 bg-emerald-50 p-3">
                      <p className="text-xs font-semibold uppercase text-emerald-700">Finalized HR Decision</p>
                      <p className="text-sm mt-1 text-emerald-900">{latestAppraisal.hr_decision}</p>
                    </div>
                  )}

                  {latestAppraisal.status !== "finalized" && (
                    <div className="rounded border-l-4 border-primary bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">AI Suggestion</p>
                      <p className="text-sm mt-1">{latestAppraisal.summary}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void handleGenerateAppraisal()}>Regenerate</Button>
                    <Button onClick={() => navigate(`/hr/appraisals?employeeId=${employee.id}`)}>
                      Review in Appraisal Module →
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
