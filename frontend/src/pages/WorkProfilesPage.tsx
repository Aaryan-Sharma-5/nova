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
} from "lucide-react";

interface WorkProfile {
  id: string;
  employee_email: string;
  github_username: string | null;
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

  const authHeader = { Authorization: `Bearer ${token}` };

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isHROrAbove ? "/api/work-profiles" : "/api/work-profiles/me";
      const res = await fetch(endpoint, { headers: authHeader });
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
    setCommitsLoading(true);
    try {
      const endpoint = isHROrAbove
        ? `/api/work-profiles/${encodeURIComponent(p.employee_email)}/commits`
        : "/api/work-profiles/me/commits";
      const res = await fetch(endpoint, { headers: authHeader });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCommits(data.commits ?? []);
    } catch {
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  };

  const linkGitHub = async () => {
    setLinking(true);
    setLinkSuccess("");
    try {
      const body: Record<string, string> = { github_username: gitHubUsername };
      if (isHROrAbove && linkTarget) body.target_email = linkTarget;
      const res = await fetch("/api/work-profiles/register-github", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed");
      }
      const data = await res.json();
      setLinkSuccess(`GitHub username linked to ${data.employee_email}`);
      setGitHubUsername("");
      setLinkTarget("");
      await fetchProfiles();
    } catch (e: unknown) {
      setLinkSuccess(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setLinking(false);
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
          <DialogTrigger asChild>
            <Button className="border-2 border-foreground shadow-[2px_2px_0px_#000] gap-2">
              <Github className="h-4 w-4" />
              Link GitHub Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link GitHub Username</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Linking a GitHub username allows NOVA to automatically build your skill profile
                from commit activity via the GitHub webhook.
              </p>
              {isHROrAbove && (
                <div>
                  <Label>Employee Email (leave blank for yourself)</Label>
                  <Input
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value)}
                    placeholder="employee@company.com"
                    className="border-2 border-foreground mt-1"
                  />
                </div>
              )}
              <div>
                <Label>GitHub Username</Label>
                <Input
                  value={gitHubUsername}
                  onChange={(e) => setGitHubUsername(e.target.value)}
                  placeholder="octocat"
                  className="border-2 border-foreground mt-1"
                />
              </div>
              {linkSuccess && (
                <p className={`text-sm font-medium ${linkSuccess.startsWith("Error") ? "text-destructive" : "text-emerald-700"}`}>
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
                <p className="font-semibold">GitHub Webhook Setup</p>
                <p className="text-muted-foreground">
                  Add this URL as a webhook in your GitHub repo settings:
                </p>
                <code className="block font-mono bg-background border border-muted px-2 py-1 rounded break-all">
                  {window.location.origin}/api/webhook/github
                </code>
                <p className="text-muted-foreground mt-1">
                  Content type: <code>application/json</code> · Events: <code>push</code>
                </p>
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
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
                  {selectedProfile.github_username && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Github className="h-3 w-3" />
                      {selectedProfile.github_username}
                    </div>
                  )}
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

              {/* Skills */}
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Skills</p>
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
              </div>

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
