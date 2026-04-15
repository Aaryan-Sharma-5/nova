import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { API_BASE_URL } from "@/lib/api";
import { CheckCircle, XCircle, Clock, Bot, Zap, Settings, UserPlus, RefreshCw } from "lucide-react";

interface Assignment {
  id: string;
  jira_issue_key: string;
  jira_issue_title: string;
  jira_issue_description: string;
  project_name: string;
  issue_type: string;
  priority: string;
  required_skills: string[];
  recommended_assignee_email: string | null;
  recommended_assignee_name: string | null;
  match_score: number;
  ai_reasoning: string;
  status: "pending" | "approved" | "rejected" | "auto_approved";
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface AutoApproveSettings {
  auto_approve_assignments: boolean;
  auto_approve_threshold: number;
  auto_post_jobs: boolean;
}

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
  approved: { label: "Approved", variant: "default" as const, icon: CheckCircle },
  auto_approved: { label: "Auto-Approved", variant: "default" as const, icon: Zap },
  rejected: { label: "Rejected", variant: "destructive" as const, icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  Highest: "bg-red-100 text-red-800 border-red-300",
  High: "bg-orange-100 text-orange-800 border-orange-300",
  Medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Low: "bg-green-100 text-green-800 border-green-300",
  Lowest: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function TaskAssignmentsPage() {
  useDocumentTitle("NOVA — Task Assignments");
  const { token } = useAuth();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [settings, setSettings] = useState<AutoApproveSettings>({
    auto_approve_assignments: false,
    auto_approve_threshold: 0.85,
    auto_post_jobs: false,
  });
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  const [rejectDialogOpen, setRejectDialogOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCreateJob, setRejectCreateJob] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [assignDialogOpen, setAssignDialogOpen] = useState<string | null>(null);
  const [employees, setEmployees] = useState<{ email: string; full_name: string }[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [reassignLoading, setReassignLoading] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${token}` };

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/task-assignments?status=${activeTab}`, { headers: authHeader });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/work-profiles/employees`, { headers: authHeader });
      if (!res.ok) return;
      const data = await res.json();
      setEmployees(data.employees ?? []);
    } catch { /* ignore */ }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/task-assignments/settings/auto-approve`, { headers: authHeader });
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  useEffect(() => {
    void fetchSettings();
    void fetchEmployees();
  }, [fetchSettings, fetchEmployees]);

  const approve = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/task-assignments/${id}/approve`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "" }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      await fetchAssignments();
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/task-assignments/${id}/reject`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason, create_job_posting: rejectCreateJob }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      setRejectDialogOpen(null);
      setRejectReason("");
      await fetchAssignments();
    } finally {
      setActionLoading(null);
    }
  };

  const reassignWithAI = async (id: string) => {
    setReassignLoading(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/task-assignments/${id}/reassign`, {
        method: "POST",
        headers: authHeader,
      });
      if (!res.ok) {
        let detail = "Reassignment failed";
        try { detail = (await res.json()).detail || detail; } catch { /* empty */ }
        alert(detail);
        return;
      }
      await fetchAssignments();
    } finally {
      setReassignLoading(null);
    }
  };

  const assignEmployee = async (assignmentId: string, assigneeEmail: string) => {
    setAssignLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/task-assignments/${assignmentId}/assign`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ assignee_email: assigneeEmail }),
      });
      if (!res.ok) {
        let detail = "Failed";
        try { detail = (await res.json()).detail || detail; } catch { /* empty */ }
        throw new Error(detail);
      }
      setAssignDialogOpen(null);
      setEmployeeSearch("");
      await fetchAssignments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setAssignLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/task-assignments/settings/auto-approve`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_approve_assignments: settings.auto_approve_assignments,
          auto_approve_threshold: settings.auto_approve_threshold,
          auto_post_jobs: settings.auto_post_jobs,
        }),
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  const matchScoreColor = (score: number) => {
    if (score >= 0.8) return "text-emerald-700 font-bold";
    if (score >= 0.6) return "text-yellow-700 font-bold";
    return "text-red-700 font-bold";
  };

  const renderAssignment = (a: Assignment) => {
    const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
      <Card key={a.id} className="border-2 border-foreground shadow-[2px_2px_0px_#000]">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold bg-foreground text-background px-1.5 py-0.5">
                  {a.jira_issue_key}
                </span>
                <Badge variant="outline" className={PRIORITY_COLORS[a.priority] ?? ""}>{a.priority}</Badge>
                <Badge variant="outline" className="text-xs">{a.issue_type}</Badge>
              </div>
              <CardTitle className="text-base">{a.jira_issue_title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{a.project_name}</p>
            </div>
            <Badge variant={cfg.variant} className="flex items-center gap-1">
              <Icon className="h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Required skills */}
          <div className="flex flex-wrap gap-1">
            {a.required_skills.map((s) => (
              <span key={s} className="text-xs border border-foreground px-1.5 py-0.5 bg-card font-medium">
                {s}
              </span>
            ))}
          </div>

          {/* Assignee block — shows AI recommendation, manual assignment, or unassigned state */}
          {a.recommended_assignee_email ? (
            <div className="border-l-4 border-primary pl-3 py-1.5 bg-primary/5 space-y-1">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">
                    {a.ai_reasoning?.startsWith("Manually") ? "Assigned: " : "AI Recommends: "}
                    <span className="text-primary">{a.recommended_assignee_name || a.recommended_assignee_email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{a.recommended_assignee_email}</p>
                </div>
                {a.match_score < 1.0 && (
                  <span className={`ml-auto text-sm tabular-nums shrink-0 ${matchScoreColor(a.match_score)}`}>
                    {(a.match_score * 100).toFixed(0)}% match
                  </span>
                )}
              </div>
              {a.ai_reasoning && (
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  {a.ai_reasoning}
                </p>
              )}
            </div>
          ) : (
            <div className="border-l-4 border-muted pl-3 py-1 bg-muted/30">
              <p className="text-xs text-muted-foreground italic">No assignee — use Assign to select an employee.</p>
            </div>
          )}

          {/* Rejection reason */}
          {a.status === "rejected" && a.rejection_reason && (
            <div className="border-l-4 border-destructive pl-3 py-1 bg-destructive/5">
              <p className="text-xs font-medium text-destructive">Rejection reason:</p>
              <p className="text-xs text-muted-foreground">{a.rejection_reason}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
            {a.status === "pending" && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-2 border-foreground"
                  onClick={() => { setAssignDialogOpen(a.id); setEmployeeSearch(""); }}
                  disabled={actionLoading === a.id || reassignLoading === a.id}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {a.recommended_assignee_email ? "Reassign" : "Assign"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-2 border-foreground"
                  onClick={() => reassignWithAI(a.id)}
                  disabled={actionLoading === a.id || reassignLoading === a.id}
                  title="Re-run AI matching with current work profiles"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${reassignLoading === a.id ? "animate-spin" : ""}`} />
                  Re-run AI
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-2 border-destructive text-destructive hover:bg-destructive hover:text-white"
                  onClick={() => { setRejectDialogOpen(a.id); setRejectReason(""); }}
                  disabled={actionLoading === a.id || reassignLoading === a.id}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="border-2 border-foreground shadow-[2px_2px_0px_#000]"
                  onClick={() => approve(a.id)}
                  disabled={actionLoading === a.id || reassignLoading === a.id || !a.recommended_assignee_email}
                  title={!a.recommended_assignee_email ? "Assign an employee first" : undefined}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Task Assignments</h1>
          <p className="text-sm text-muted-foreground">
            AI-recommended assignments from JIRA tickets. Review and approve or reject each one.
          </p>
        </div>

        {/* Auto-approve settings panel */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-2 border-foreground shadow-[2px_2px_0px_#000] gap-2">
              <Settings className="h-4 w-4" />
              Auto-Approve Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Auto-Approve Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold">Auto-approve assignments</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Skip the limbo queue when match score meets the threshold
                  </p>
                </div>
                <Switch
                  checked={settings.auto_approve_assignments}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_approve_assignments: v }))}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="font-semibold">Confidence threshold</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0.5}
                    max={1.0}
                    step={0.05}
                    value={settings.auto_approve_threshold}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, auto_approve_threshold: parseFloat(e.target.value) || 0.85 }))
                    }
                    className="w-24 border-2 border-foreground"
                  />
                  <span className="text-sm text-muted-foreground">
                    ({(settings.auto_approve_threshold * 100).toFixed(0)}% minimum match)
                  </span>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold">Auto-post jobs</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically publish job postings when no match is found
                  </p>
                </div>
                <Switch
                  checked={settings.auto_post_jobs}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_post_jobs: v }))}
                />
              </div>
              <Button
                className="w-full border-2 border-foreground shadow-[2px_2px_0px_#000]"
                onClick={saveSettings}
                disabled={settingsLoading}
              >
                {settingsLoading ? "Saving…" : "Save Settings"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reject dialog */}
      {rejectDialogOpen && (
        <Dialog open={!!rejectDialogOpen} onOpenChange={() => setRejectDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Rejection reason <span className="text-destructive">*</span></Label>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Employee is on leave, skill mismatch"
                  className="border-2 border-foreground"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="create-job"
                  checked={rejectCreateJob}
                  onCheckedChange={setRejectCreateJob}
                />
                <Label htmlFor="create-job" className="cursor-pointer">
                  Create a job posting for this role
                </Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRejectDialogOpen(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => rejectDialogOpen && reject(rejectDialogOpen)}
                  disabled={!rejectReason.trim() || !!actionLoading}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign dialog */}
      {assignDialogOpen && (
        <Dialog open={!!assignDialogOpen} onOpenChange={() => setAssignDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <Input
                placeholder="Search by name or email…"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="border-2 border-foreground"
              />
              <div className="max-h-72 overflow-y-auto space-y-1 border border-muted rounded">
                {employees
                  .filter((e) => {
                    const q = employeeSearch.toLowerCase();
                    return !q || e.email.toLowerCase().includes(q) || (e.full_name || "").toLowerCase().includes(q);
                  })
                  .map((e) => (
                    <button
                      key={e.email}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-2"
                      onClick={() => assignEmployee(assignDialogOpen, e.email)}
                      disabled={assignLoading}
                    >
                      <span className="font-medium">{e.full_name || e.email}</span>
                      <span className="text-xs text-muted-foreground truncate">{e.email}</span>
                    </button>
                  ))}
                {employees.filter((e) => {
                  const q = employeeSearch.toLowerCase();
                  return !q || e.email.toLowerCase().includes(q) || (e.full_name || "").toLowerCase().includes(q);
                }).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No employees found.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecting an employee will assign and immediately approve this task.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)}>
        <TabsList className="border-2 border-foreground">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="auto_approved">Auto-Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        {["pending", "approved", "auto_approved", "rejected"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
              </div>
            ) : assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-foreground">
                <Clock className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-semibold">No {tab} assignments</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {tab === "pending" ? "All caught up! New JIRA tickets will appear here." : `No ${tab} assignments found.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">{assignments.map(renderAssignment)}</div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
