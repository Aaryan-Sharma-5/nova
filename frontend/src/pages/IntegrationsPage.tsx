import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Copy, CheckCheck, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";

const API_BASE = "";
const ORG_ID = "demo-org";

function CopyBlock({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>}
      <div className="flex items-center gap-2 border-2 border-foreground bg-muted/30 px-3 py-2">
        <code className="text-xs font-mono flex-1 break-all">{value}</code>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copy}>
          {copied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

interface ComposioConnection {
  app_name: string;
  is_active: boolean;
  last_synced_at: string | null;
  connected_at: string | null;
  connection_status?: string;
  is_pending?: boolean;
  redirect_url?: string;
}


export default function IntegrationsPage() {
  useDocumentTitle("NOVA — Integrations");
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);

  // Slack / Composio state
  const [slackConn, setSlackConn] = useState<ComposioConnection | null>(null);
  const [slackLoading, setSlackLoading] = useState(false);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [syncingSlack, setSyncingSlack] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const webhookBase = window.location.origin;

  // Load Jira status
  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch("/api/integrations/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) await res.json();
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, [token]);

  // Load Slack connection status
  const loadSlackStatus = async () => {
    if (!token) return;
    setSlackLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/composio/status/${ORG_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const slack = (data.connections as ComposioConnection[])?.find(
        (c) => c.app_name === "slack"
      ) ?? null;
      setSlackConn(slack);
    } catch { /* ignore */ }
    finally { setSlackLoading(false); }
  };

  useEffect(() => { void loadSlackStatus(); }, [token]);

  // When the user returns from the OAuth tab, re-check status automatically
  useEffect(() => {
    const handleFocus = () => { void loadSlackStatus(); };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [token]);

  // Connect Slack — opens OAuth in new tab
  const connectSlack = async () => {
    if (!token) return;
    setConnectingSlack(true);
    setConnectError(null);
    try {
      const res = await fetch(`${API_BASE}/api/composio/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ app_name: "slack", org_id: ORG_ID }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setConnectError(err.detail ?? `Error ${res.status}: ${res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.redirect_url) {
        window.open(data.redirect_url, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => void loadSlackStatus(), 5000);
    } catch (e) {
      setConnectError(`Network error — is the backend running on port 8000?`);
    } finally {
      setConnectingSlack(false);
    }
  };

  // Trigger Slack sync
  const triggerSync = async () => {
    if (!token) return;
    setSyncingSlack(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/composio/sync/trigger`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: ORG_ID,
          entity_id: ORG_ID,
          apps: ["slack"],
          since_hours: 168,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSyncResult(err.detail ?? "Sync failed — check backend logs.");
        return;
      }
      setSyncResult("Sync started! Sentiment analysis will run in the background.");
      void loadSlackStatus();
    } catch {
      setSyncResult("Network error — is the backend running?");
    } finally {
      setSyncingSlack(false);
    }
  };

  const comingSoon = [
    { name: "Google Calendar", reason: "Will enable meeting load analysis. Requires Google Workspace admin OAuth. Coming next release." },
    { name: "HRMS / SAP", reason: "Direct HRMS sync will auto-import employee records and org structure. Requires IT API access." },
  ];

  const slackIsActive = Boolean(slackConn?.is_active);
  const slackIsPending = Boolean(
    slackConn &&
    !slackConn.is_active &&
    ((slackConn.is_pending === true) || (slackConn.connection_status || "").toUpperCase() === "INITIATED")
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external tools to NOVA. Slack uses OAuth via Composio — no API keys needed.
        </p>
      </div>

      {/* ── SLACK Integration ── */}
      <Card className="border-2 border-foreground shadow-[2px_2px_0px_#000]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-[#4A154B] text-white text-xs font-black">#</span>
              Slack
            </span>
            {slackLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : slackIsActive ? (
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : slackIsPending ? (
              <Badge className="bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                <Loader2 className="h-3 w-3" /> Auth pending
              </Badge>
            ) : (
              <Badge variant="outline" className="flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Not connected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Once connected, NOVA can pull Slack message metadata on manual sync and via nightly auto-sync.
            Sentiment processing for buffered messages runs every 2 minutes.
            Raw message text is <strong>never stored</strong> — only emotion scores and risk signals.
          </p>

          <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
            <li>Connect your Slack workspace via OAuth below</li>
            <li>Trigger a sync to pull the last 7 days of messages (or wait for nightly auto-sync)</li>
            <li>Sentiment scores feed into burnout and flight-risk models automatically</li>
          </ol>

          <Separator />

          {slackIsActive ? (
            <div className="space-y-3">
              <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-emerald-900">Slack workspace connected</p>
                {slackConn.last_synced_at && (
                  <p className="text-emerald-700">
                    Last synced: {new Date(slackConn.last_synced_at).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => void triggerSync()}
                  disabled={syncingSlack}
                  className="flex items-center gap-2"
                >
                  {syncingSlack
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
                    : <><RefreshCw className="h-4 w-4" /> Sync Now (last 7 days)</>
                  }
                </Button>
                <Button variant="outline" size="sm" onClick={() => void loadSlackStatus()}>
                  Refresh status
                </Button>
              </div>

              {syncResult && (
                <p className="text-xs text-muted-foreground border border-muted bg-muted/30 p-2">
                  {syncResult}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {slackIsPending && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
                  <p className="font-semibold text-amber-900">Slack authorization pending</p>
                  <p className="text-amber-800">
                    OAuth was initiated but not completed yet. Finish authorization in Slack, then refresh status.
                  </p>
                  {slackConn?.redirect_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(slackConn.redirect_url, "_blank", "noopener,noreferrer")}
                    >
                      Resume OAuth
                    </Button>
                  )}
                </div>
              )}

              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-900">Before connecting</p>
                <p className="text-amber-800">
                  Make sure your team members' Slack profile emails match their NOVA account emails.
                  Slack Settings → Profile → Edit → Email.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={() => void connectSlack()}
                  disabled={connectingSlack}
                  className="flex items-center gap-2"
                >
                  {connectingSlack
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening OAuth…</>
                    : "Connect Slack Workspace"
                  }
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={slackLoading}
                  onClick={() => void loadSlackStatus()}
                  className="flex items-center gap-2"
                >
                  {slackLoading
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Checking…</>
                    : <><RefreshCw className="h-3 w-3" /> Refresh status</>
                  }
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                After authorizing in Slack, come back here and click "Refresh status" (or switch to this tab — it checks automatically).
              </p>
              {connectError && (
                <p className="text-xs text-red-600 border border-red-200 bg-red-50 p-2">{connectError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── JIRA Integration ── */}
      <Card className="border-2 border-foreground shadow-[2px_2px_0px_#000]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-[#0052CC] text-white text-xs font-black">J</span>
              Jira
            </span>
            {loading ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-300">
                Webhook-ready
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">When a Jira issue is created, NOVA automatically:</p>
          <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
            <li>Extracts required skills from the ticket using AI</li>
            <li>Finds the best-matched employee by skill profile</li>
            <li>Places the assignment in the <strong>HR approval queue</strong></li>
            <li>If no match found → creates a <strong>job posting</strong> for HR review</li>
          </ol>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-semibold">Webhook URL</p>
            <CopyBlock value={`${webhookBase}/api/webhook/jira`} label="POST endpoint" />
            <p className="text-xs text-muted-foreground">
              In Jira: <strong>Project Settings → Webhooks → Create Webhook</strong>.
              Select <code className="bg-muted px-1">jira:issue_created</code>,{" "}
              <code className="bg-muted px-1">sprint_created</code>, and{" "}
              <code className="bg-muted px-1">sprint_started</code> events.
            </p>
          </div>

          <Separator />

          <div className="rounded border border-muted bg-muted/30 p-3 text-xs space-y-2">
            <p className="font-semibold">Expected payload:</p>
            <pre className="font-mono text-[10px] overflow-x-auto text-muted-foreground whitespace-pre-wrap">{`{
  "webhookEvent": "jira:issue_created",
  "issue": {
    "key": "PROJ-42",
    "fields": {
      "summary": "Build user auth module",
      "description": "Implement JWT-based auth...",
      "priority": { "name": "High" },
      "issuetype": { "name": "Story" },
      "project": { "name": "My Project", "key": "PROJ" }
    }
  }
}`}</pre>
          </div>
        </CardContent>
      </Card>

      {/* ── GitHub Integration ── */}
      <Card className="border-2 border-foreground shadow-[2px_2px_0px_#000]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-[#24292e] text-white">
                <span className="text-xs font-bold">GH</span>
              </span>
              GitHub
            </span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-300">
              Webhook-ready
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">When an employee pushes commits, NOVA automatically:</p>
          <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
            <li>Analyses the diff using AI to extract skills</li>
            <li>Rates the code quality (0–100)</li>
            <li>Updates the employee's skill profile and rolling quality score</li>
            <li>Profile is used to match incoming Jira tickets</li>
          </ol>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-semibold">Webhook URL</p>
            <CopyBlock value={`${webhookBase}/api/webhook/github`} label="POST endpoint" />
            <p className="text-xs text-muted-foreground">
              In GitHub: <strong>Repo Settings → Webhooks → Add webhook</strong>.
              Content type: <code className="bg-muted px-1">application/json</code>, event: <code className="bg-muted px-1">push</code>.
            </p>
          </div>

          <Separator />

          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
            <p className="font-semibold text-amber-900">Important: Link GitHub usernames first</p>
            <p className="text-amber-800">
              Employees must link their GitHub username in{" "}
              <a href="/work-profiles" className="underline font-medium">Work Profiles</a>{" "}
              before commits will be attributed to them.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Coming soon ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {comingSoon.map((item) => (
          <Card key={item.name} className="border-2 border-muted opacity-60">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{item.name}</span>
                <Badge variant="outline">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{item.reason}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
