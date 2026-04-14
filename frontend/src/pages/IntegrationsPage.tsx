import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Copy, CheckCheck, Github, ExternalLink } from "lucide-react";

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

interface IntegrationStatus {
  jira?: { connected: boolean; last_sync_at: string | null; mode: string };
  [key: string]: unknown;
}

export default function IntegrationsPage() {
  useDocumentTitle("NOVA — Integrations");
  const { token } = useAuth();
  const [status, setStatus] = useState<IntegrationStatus>({});
  const [loading, setLoading] = useState(false);

  const webhookBase = window.location.origin;

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch("/api/integrations/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        setStatus(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const comingSoon = [
    { name: "Slack", reason: "Requires org-wide communication consent policy — deliberately excluded to protect employee privacy." },
    { name: "Google Calendar", reason: "Will enable meeting load analysis. Requires Google Workspace admin OAuth. Coming next release." },
    { name: "HRMS / SAP", reason: "Direct HRMS sync will auto-import employee records and org structure. Requires IT API access." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external tools to NOVA via webhooks. No API keys needed — events are pushed to NOVA automatically.
        </p>
      </div>

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
          <p className="text-sm">
            When a Jira issue is created, NOVA automatically:
          </p>
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
              Select the <code className="bg-muted px-1">jira:issue_created</code>,{" "}
              <code className="bg-muted px-1">sprint_created</code>, and{" "}
              <code className="bg-muted px-1">sprint_started</code> events.
            </p>
          </div>

          <Separator />

          <div className="rounded border border-muted bg-muted/30 p-3 text-xs space-y-2">
            <p className="font-semibold">Expected payload (Jira sends automatically):</p>
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
                <Github className="h-4 w-4" />
              </span>
              GitHub
            </span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-300">
              Webhook-ready
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            When an employee pushes commits, NOVA automatically:
          </p>
          <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
            <li>Analyses the diff using AI to extract skills</li>
            <li>Rates the code quality (0-100, with label: good / neutral / poor)</li>
            <li>Updates the employee's skill profile and rolling quality score</li>
            <li>The profile is then used to match incoming Jira tickets</li>
          </ol>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-semibold">Webhook URL</p>
            <CopyBlock value={`${webhookBase}/api/webhook/github`} label="POST endpoint" />
            <p className="text-xs text-muted-foreground">
              In GitHub: <strong>Repo Settings → Webhooks → Add webhook</strong>.
              Set content type to <code className="bg-muted px-1">application/json</code>{" "}
              and select the <code className="bg-muted px-1">push</code> event.
            </p>
          </div>

          <Separator />

          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
            <p className="font-semibold text-amber-900">Important: Link GitHub usernames first</p>
            <p className="text-amber-800">
              Employees must link their GitHub username in{" "}
              <a href="/work-profiles" className="underline font-medium">Work Profiles</a>{" "}
              before commits will be attributed to them. Unlinked pushes are silently ignored.
            </p>
          </div>

          <div className="rounded border border-muted bg-muted/30 p-3 text-xs space-y-2">
            <p className="font-semibold">Commit diff inclusion (recommended GitHub Action):</p>
            <p className="text-muted-foreground">
              GitHub push webhooks do not include diffs by default. For full analysis, include
              the diff in each commit object. You can do this with a GitHub Action that calls
              the webhook with diff content, or use the manual commit submission endpoint.
            </p>
            <a
              href="https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#push"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline"
            >
              GitHub push webhook docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ── Coming soon ── */}
      <div className="grid gap-4 sm:grid-cols-3">
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
