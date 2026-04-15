import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { API_BASE_URL } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Github,
  Code2,
  Star,
  TrendingUp,
  GitCommit,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Pencil,
  Save,
  Link,
} from "lucide-react";

interface WorkProfile {
  id: string;
  employee_email: string;
  github_username: string | null;
  jira_account_id: string | null;
  skills: string[];
  total_commits: number;
  avg_code_quality: number;
  profile_summary: string;
  last_commit_at: string | null;
  updated_at: string;
}

interface CommitAnalysis {
  id: string;
  commit_hash: string;
  commit_message: string;
  repository: string;
  branch: string;
  diff_summary: string;
  skills_demonstrated: string[];
  code_quality_score: number;
  code_quality_label: "good" | "neutral" | "poor";
  complexity: string;
  impact: string;
  quality_reasoning: string;
  lines_added: number;
  lines_deleted: number;
  files_changed: number;
  triggered_profile_update: boolean;
  committed_at: string | null;
  created_at: string;
}

const QUALITY_CONFIG = {
  good: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-300", icon: ArrowUpRight },
  neutral: { color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-300", icon: Minus },
  poor: { color: "text-red-700", bg: "bg-red-50 border-red-300", icon: ArrowDownRight },
};

export default function WorkProfilesPage() {
  useDocumentTitle("NOVA — Work Profiles");
  const { token, user } = useAuth();
  const isHROrAbove = user?.role === "hr" || user?.role === "leadership" || user?.role === "manager";

  const [profiles, setProfiles] = useState<WorkProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<WorkProfile | null>(null);
  const [commits, setCommits] = useState<CommitAnalysis[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [gitHubUsername, setGitHubUsername] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState("");

  const [jiraAccountId, setJiraAccountId] = useState("");
  const [jiraTarget, setJiraTarget] = useState("");
  const [linkingJira, setLinkingJira] = useState(false);
  const [jiraSuccess, setJiraSuccess] = useState("");

  // HR edit state (inside sheet)
  const [editMode, setEditMode] = useState(false);
  const [editGithub, setEditGithub] = useState("");
  const [editJira, setEditJira] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const authHeader = { Authorization: `Bearer ${token}` };

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isHROrAbove ? "/api/work-profiles" : "/api/work-profiles/me";
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeader });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (isHROrAbove) {
        setProfiles(data.profiles ?? []);
      } else {
        setProfiles(data.profile ? [data.profile] : []);
      }
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [token, isHROrAbove]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  const openProfile = async (p: WorkProfile) => {
    setSelectedProfile(p);
    setSheetOpen(true);
    setEditMode(false);
    setSaveMsg("");
    setEditGithub(p.github_username ?? "");
    setEditSkills((p.skills ?? []).join(", "));
    setEditSummary(p.profile_summary ?? "");
    setEditJira(p.jira_account_id ?? "");
    setCommitsLoading(true);
    try {
      const endpoint = isHROrAbove
        ? `/api/work-profiles/${encodeURIComponent(p.employee_email)}/commits`
        : "/api/work-profiles/me/commits";
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeader });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCommits(data.commits ?? []);
    } catch {
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const payload: Record<string, unknown> = {};
      if (editGithub !== (selectedProfile.github_username ?? "")) payload.github_username = editGithub;
      if (editJira !== (selectedProfile.jira_account_id ?? "")) payload.jira_account_id = editJira;
      const newSkills = editSkills.split(",").map((s) => s.trim()).filter(Boolean);
      if (JSON.stringify(newSkills) !== JSON.stringify(selectedProfile.skills ?? [])) payload.skills = newSkills;
      if (editSummary !== (selectedProfile.profile_summary ?? "")) payload.profile_summary = editSummary;

      if (Object.keys(payload).length === 0) { setSaveMsg("No changes to save."); return; }

      const res = await fetch(`${API_BASE_URL}/api/work-profiles/${encodeURIComponent(selectedProfile.employee_email)}`, {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = "Save failed";
        try { detail = (await res.json()).detail || detail; } catch { /* empty */ }
        throw new Error(detail);
      }
      setSaveMsg("Saved.");
      setEditMode(false);
      await fetchProfiles();
      // Refresh selected profile data
      setSelectedProfile((prev) => prev ? {
        ...prev,
        github_username: editGithub || null,
        skills: editSkills.split(",").map((s) => s.trim()).filter(Boolean),
        profile_summary: editSummary,
      } : prev);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const linkGitHub = async () => {
    setLinking(true);
    setLinkSuccess("");
    try {
      const body: Record<string, string> = { github_username: gitHubUsername };
      if (isHROrAbove && linkTarget) body.target_email = linkTarget;
      const res = await fetch(`${API_BASE_URL}/api/work-profiles/register-github`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "Failed";
        try { detail = (await res.json()).detail || detail; } catch { /* empty body */ }
        throw new Error(detail);
      }
      const data = await res.json();
      setLinkSuccess(`Saved. GitHub username linked to ${data.employee_email}`);
      await fetchProfiles();
    } catch (e: unknown) {
      setLinkSuccess(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setLinking(false);
    }
  };

  const linkJira = async () => {
    setLinkingJira(true);
    setJiraSuccess("");
    try {
      const body: Record<string, string> = { jira_account_id: jiraAccountId };
      if (isHROrAbove && jiraTarget) body.target_email = jiraTarget;
      const res = await fetch(`${API_BASE_URL}/api/work-profiles/register-jira`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "Failed";
        try { detail = (await res.json()).detail || detail; } catch { /* empty */ }
        throw new Error(detail);
      }
      const data = await res.json();
      setJiraSuccess(`Saved. JIRA account linked to ${data.employee_email}`);
      await fetchProfiles();
    } catch (e: unknown) {
      setJiraSuccess(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setLinkingJira(false);
    }
  };

  const qualityBar = (score: number) => {
    const pct = Math.round(score);
    const color = score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums font-mono w-8 text-right">{pct}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Work Profiles</h1>
          <p className="text-sm text-muted-foreground">
            AI-built skill profiles from GitHub commit activity.
          </p>
        </div>

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <Button
            className="border-2 border-foreground shadow-[2px_2px_0px_#000] gap-2"
            onClick={() => {
              // Pre-fill with the current user's existing values
              const myProfile = profiles.find((p) => p.employee_email === user?.email);
              setGitHubUsername(myProfile?.github_username ?? "");
              setJiraAccountId(myProfile?.jira_account_id ?? "");
              setLinkTarget("");
              setJiraTarget("");
              setLinkSuccess("");
              setJiraSuccess("");
              setLinkDialogOpen(true);
            }}
          >
            <Link className="h-4 w-4" />
            Link Accounts
          </Button>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Link External Accounts</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">

              {/* ── GitHub section ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  <p className="font-semibold text-sm">GitHub</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  NOVA analyses your commits to build a skill profile automatically.
                </p>
                {isHROrAbove && (
                  <div>
                    <Label className="text-xs">Employee Email (leave blank for yourself)</Label>
                    <Input
                      value={linkTarget}
                      onChange={(e) => setLinkTarget(e.target.value)}
                      placeholder="employee@company.com"
                      className="border-2 border-foreground mt-1 h-8 text-sm"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">GitHub Username</Label>
                  <Input
                    value={gitHubUsername}
                    onChange={(e) => setGitHubUsername(e.target.value)}
                    placeholder="octocat"
                    className="border-2 border-foreground mt-1 h-8 text-sm"
                  />
                  {profiles.find(p => p.employee_email === user?.email)?.github_username && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Currently saved: <span className="font-mono font-medium">{profiles.find(p => p.employee_email === user?.email)?.github_username}</span>
                    </p>
                  )}
                </div>
                {linkSuccess && (
                  <p className={`text-xs font-medium ${linkSuccess.startsWith("Error") ? "text-destructive" : "text-emerald-700"}`}>
                    {linkSuccess}
                  </p>
                )}
                <Button
                  className="w-full border-2 border-foreground shadow-[2px_2px_0px_#000]"
                  onClick={linkGitHub}
                  disabled={linking || !gitHubUsername.trim()}
                >
                  {linking ? "Linking…" : "Link GitHub"}
                </Button>
                <div className="rounded border border-muted bg-muted/30 p-3 text-xs space-y-1">
                  <p className="font-semibold">Webhook Setup</p>
                  <code className="block font-mono bg-background border border-muted px-2 py-1 rounded break-all">
                    {window.location.origin}/api/webhook/github
                  </code>
                  <p className="text-muted-foreground">Content type: <code>application/json</code> · Event: <code>push</code></p>
                </div>
              </div>

              <Separator />

              {/* ── JIRA section ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">J</span>
                  <p className="font-semibold text-sm">JIRA</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  When a task is approved on NOVA, it will be automatically assigned to you on JIRA.
                  Find your Account ID in JIRA: <span className="font-mono">Profile → Account ID</span> (the long string in the URL).
                </p>
                {isHROrAbove && (
                  <div>
                    <Label className="text-xs">Employee Email (leave blank for yourself)</Label>
                    <Input
                      value={jiraTarget}
                      onChange={(e) => setJiraTarget(e.target.value)}
                      placeholder="employee@company.com"
                      className="border-2 border-foreground mt-1 h-8 text-sm"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">JIRA Account ID</Label>
                  <Input
                    value={jiraAccountId}
                    onChange={(e) => setJiraAccountId(e.target.value)}
                    placeholder="712020:abc123..."
                    className="border-2 border-foreground mt-1 h-8 text-sm font-mono"
                  />
                  {profiles.find(p => p.employee_email === user?.email)?.jira_account_id && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Currently saved: <span className="font-mono font-medium">{profiles.find(p => p.employee_email === user?.email)?.jira_account_id}</span>
                    </p>
                  )}
                </div>
                {jiraSuccess && (
                  <p className={`text-xs font-medium ${jiraSuccess.startsWith("Error") ? "text-destructive" : "text-emerald-700"}`}>
                    {jiraSuccess}
                  </p>
                )}
                <Button
                  className="w-full border-2 border-foreground shadow-[2px_2px_0px_#000]"
                  onClick={linkJira}
                  disabled={linkingJira || !jiraAccountId.trim()}
                >
                  {linkingJira ? "Linking…" : "Link JIRA Account"}
                </Button>
              </div>

            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Profiles grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-foreground text-center">
          <Code2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-semibold">No work profiles yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Link a GitHub account and push some commits to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <Card
              key={p.id}
              className="border-2 border-foreground shadow-[2px_2px_0px_#000] cursor-pointer hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] transition-all"
              onClick={() => openProfile(p)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold truncate max-w-[180px]">
                      {p.employee_email}
                    </CardTitle>
                    {p.github_username && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Github className="h-3 w-3" />
                        <span>{p.github_username}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="border border-foreground p-2">
                    <div className="flex items-center justify-center gap-1">
                      <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-lg font-bold tabular-nums">{p.total_commits}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Commits</p>
                  </div>
                  <div className="border border-foreground p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-lg font-bold tabular-nums">{Math.round(p.avg_code_quality)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Avg Quality</p>
                  </div>
                </div>
                {qualityBar(p.avg_code_quality)}
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.skills.slice(0, 4).map((s) => (
                    <span key={s} className="text-[10px] border border-foreground px-1 py-0.5 font-medium">
                      {s}
                    </span>
                  ))}
                  {p.skills.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{p.skills.length - 4} more</span>
                  )}
                </div>
                {p.last_commit_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Last commit: {new Date(p.last_commit_at).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Profile detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) { setEditMode(false); setSaveMsg(""); } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedProfile && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Work Profile
                </SheetTitle>
                <div>
                  <p className="font-semibold text-sm">{selectedProfile.employee_email}</p>
                  <div className="flex flex-wrap gap-3 mt-0.5">
                    {selectedProfile.github_username && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Github className="h-3 w-3" />
                        {selectedProfile.github_username}
                      </div>
                    )}
                    {selectedProfile.jira_account_id && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="text-[9px] font-bold bg-blue-600 text-white px-1 py-0.5 rounded">J</span>
                        <span className="font-mono truncate max-w-[140px]">{selectedProfile.jira_account_id}</span>
                      </div>
                    )}
                  </div>
                </div>
              </SheetHeader>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Commits", value: selectedProfile.total_commits },
                  { label: "Avg Quality", value: `${Math.round(selectedProfile.avg_code_quality)}/100` },
                  { label: "Skills", value: selectedProfile.skills.length },
                ].map((stat) => (
                  <div key={stat.label} className="border-2 border-foreground p-2 text-center">
                    <p className="text-xl font-bold tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Skills — view or edit depending on mode */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Skills</p>
                  {isHROrAbove && !editMode && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditMode(true)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit Profile
                    </Button>
                  )}
                </div>
                {!editMode ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProfile.skills.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No skills detected yet.</span>
                    ) : (
                      selectedProfile.skills.map((s) => (
                        <span key={s} className="text-xs border border-foreground px-2 py-0.5 font-medium bg-card">
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              {/* HR edit panel */}
              {isHROrAbove && editMode && (
                <div className="mb-4 border-2 border-foreground p-3 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Edit Profile</p>
                  <div>
                    <Label className="text-xs">GitHub Username</Label>
                    <Input
                      value={editGithub}
                      onChange={(e) => setEditGithub(e.target.value)}
                      placeholder="octocat"
                      className="border-2 border-foreground mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">JIRA Account ID</Label>
                    <Input
                      value={editJira}
                      onChange={(e) => setEditJira(e.target.value)}
                      placeholder="712020:abc123..."
                      className="border-2 border-foreground mt-1 h-8 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Skills <span className="text-muted-foreground font-normal">(comma-separated — embeddings regenerated on save)</span></Label>
                    <Input
                      value={editSkills}
                      onChange={(e) => setEditSkills(e.target.value)}
                      placeholder="Python, FastAPI, React"
                      className="border-2 border-foreground mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Profile Summary</Label>
                    <Textarea
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      placeholder="Brief description of this employee's technical profile…"
                      className="border-2 border-foreground mt-1 text-sm"
                      rows={3}
                    />
                  </div>
                  {saveMsg && (
                    <p className={`text-xs font-medium ${saveMsg === "Saved." ? "text-emerald-700" : "text-destructive"}`}>
                      {saveMsg}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditMode(false); setSaveMsg(""); }}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="border-2 border-foreground shadow-[2px_2px_0px_#000]"
                      onClick={saveProfile}
                      disabled={saving}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {saving ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </div>
              )}

              <Separator className="my-4" />

              {/* Commits */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Commit History
                </p>
                {commitsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : commits.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border border-dashed">
                    No commits analysed yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {commits.map((c) => {
                      const cfg = QUALITY_CONFIG[c.code_quality_label] ?? QUALITY_CONFIG.neutral;
                      const Icon = cfg.icon;
                      return (
                        <div key={c.id} className={`border-2 p-3 rounded-none ${cfg.bg}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                                <code className="font-mono">{c.commit_hash.slice(0, 7)}</code>
                                <span>·</span>
                                <span>{c.repository}</span>
                                <span>·</span>
                                <span>{c.branch}</span>
                              </div>
                              <p className="text-sm font-semibold leading-tight line-clamp-1">{c.commit_message}</p>
                            </div>
                            <div className={`flex items-center gap-1 text-xs font-bold shrink-0 ${cfg.color}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {c.code_quality_label}
                              <span className="font-mono">({Math.round(c.code_quality_score)})</span>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground mb-1.5">{c.diff_summary}</p>

                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {c.skills_demonstrated.map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px] h-4 px-1">
                                {s}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="text-green-700">+{c.lines_added}</span>
                            <span className="text-red-700">-{c.lines_deleted}</span>
                            <span>{c.files_changed} files</span>
                            <span className="ml-auto">{c.complexity} complexity · {c.impact} impact</span>
                            {c.triggered_profile_update && (
                              <Badge variant="secondary" className="text-[9px] h-3.5 px-1">Profile updated</Badge>
                            )}
                          </div>

                          {c.quality_reasoning && (
                            <p className="text-[10px] text-muted-foreground mt-1 italic">{c.quality_reasoning}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
