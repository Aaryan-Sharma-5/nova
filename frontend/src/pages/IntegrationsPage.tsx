import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { API_BASE_URL } from "@/lib/api";
import { RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";

const API_BASE = API_BASE_URL;
const ORG_ID = "demo-org";

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

  const comingSoon = ["Google Calendar", "HRMS / SAP"];

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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          <CardContent className="space-y-3">
            {slackIsActive ? (
              <>
                {slackConn?.last_synced_at && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(slackConn.last_synced_at).toLocaleString()}
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={() => void triggerSync()}
                    disabled={syncingSlack}
                    className="flex items-center gap-2"
                  >
                    {syncingSlack
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
                      : <><RefreshCw className="h-4 w-4" /> Sync now</>
                    }
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadSlackStatus()}>
                    Refresh status
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={() => void connectSlack()}
                  disabled={connectingSlack}
                  className="flex items-center gap-2"
                >
                  {connectingSlack
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening OAuth…</>
                    : "Connect Slack"
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
            )}
            {syncResult && (
              <p className="text-xs text-muted-foreground border border-muted bg-muted/30 p-2">{syncResult}</p>
            )}
            {connectError && (
              <p className="text-xs text-red-600 border border-red-200 bg-red-50 p-2">{connectError}</p>
            )}
          </CardContent>
        </Card>

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
          <CardContent />
        </Card>

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
          <CardContent />
        </Card>

        {comingSoon.map((item) => (
          <Card key={item} className="border-2 border-muted opacity-60">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{item}</span>
                <Badge variant="outline">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
