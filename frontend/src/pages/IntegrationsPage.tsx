import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function IntegrationsPage() {
  useDocumentTitle('NOVA — Integrations');
  const { token } = useAuth();
  const [status, setStatus] = useState<any>({});
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [projectKeys, setProjectKeys] = useState("NOVA");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch("/api/integrations/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const payload = await response.json();
        setStatus(payload);
      } catch {
        setStatus({});
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  const saveJiraConfig = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await fetch("/api/integrations/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          integration_type: "jira",
          config: {
            jira_base_url: jiraBaseUrl,
            api_token: jiraToken,
            project_keys: projectKeys.split(',').map((value) => value.trim()).filter(Boolean),
            sync_frequency_hours: 24,
          },
        }),
      });
      const refreshed = await fetch("/api/integrations/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (refreshed.ok) {
        setStatus(await refreshed.json());
      }
      setStatus((previous: any) => ({
        ...previous,
        jira: {
          ...(previous?.jira || {}),
          connected: true,
          last_sync_at: 'Just now',
          mode: 'mock',
        },
      }));
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult("");
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    setTestResult("Connection successful (demo mode)");
    setTesting(false);
  };

  const comingSoonReason: Record<string, string> = {
    Slack: "Slack integration requires org-wide communication consent policy. We've deliberately excluded it to protect employee privacy — message content should never feed into performance analytics.",
    "Google Calendar": "Calendar integration will enable meeting load analysis and 1:1 frequency tracking. Requires Google Workspace admin OAuth approval. Coming in next release.",
    "HRMS/SAP": "Direct HRMS integration will auto-sync employee records, salary bands, and org structure. Requires IT department API access configuration.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground">Manage external data connectors for objective organizational signals.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Jira</span>
              <Badge variant={status?.jira?.connected ? "default" : "secondary"}>
                {status?.jira?.connected ? "Connected (Demo)" : "Disconnected"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <Skeleton className="h-4 w-40" /> : <p className="text-sm">Last sync: {status?.jira?.last_sync_at || "Never"}</p>}
            <p className="text-sm">Employees covered: 100 (demo)</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Configure</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure Jira</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="jira-base-url">Base URL</Label>
                    <Input id="jira-base-url" value={jiraBaseUrl} onChange={(e) => setJiraBaseUrl(e.target.value)} placeholder="https://your-org.atlassian.net" />
                  </div>
                  <div>
                    <Label htmlFor="jira-api-token">API Token</Label>
                    <Input id="jira-api-token" value={jiraToken} onChange={(e) => setJiraToken(e.target.value)} placeholder="Atlassian token" type="password" />
                  </div>
                  <div>
                    <Label htmlFor="jira-project-keys">Project Keys</Label>
                    <Input id="jira-project-keys" value={projectKeys} onChange={(e) => setProjectKeys(e.target.value)} placeholder="NOVA,HR,PEOPLE" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={testConnection} disabled={testing}>
                      {testing ? 'Testing...' : 'Test Connection'}
                    </Button>
                    {testResult && <p className="text-sm text-emerald-700 self-center">{testResult}</p>}
                  </div>
                  <Button onClick={saveJiraConfig} disabled={saving}>
                    {saving ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {[
          { name: "Slack", subtitle: "Coming soon" },
          { name: "Google Calendar", subtitle: "Coming soon" },
          { name: "HRMS/SAP", subtitle: "Coming soon" },
        ].map((item) => (
          <Card key={item.name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{item.name}</span>
                <Badge variant="outline">{item.subtitle}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="px-0">Why we haven't added this yet</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{comingSoonReason[item.name]}</p>
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
