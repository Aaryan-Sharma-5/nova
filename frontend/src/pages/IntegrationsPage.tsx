import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { API_BASE_URL } from "@/lib/api";
import { RefreshCw, Loader2, CheckCircle2, XCircle, Calendar } from "lucide-react";

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

type IntegrationState = {
  conn: ComposioConnection | null;
  loading: boolean;
  connecting: boolean;
  syncing: boolean;
  syncResult: string | null;
  connectError: string | null;
};


export default function IntegrationsPage() {
  useDocumentTitle("NOVA — Integrations");
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);

  const [slackState, setSlackState] = useState<IntegrationState>({
    conn: null,
    loading: false,
    connecting: false,
    syncing: false,
    syncResult: null,
    connectError: null,
  });

  const [calendarState, setCalendarState] = useState<IntegrationState>({
    conn: null,
    loading: false,
    connecting: false,
    syncing: false,
    syncResult: null,
    connectError: null,
  });

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

  const loadComposioStatus = async (appName: string, setState: (updater: (prev: IntegrationState) => IntegrationState) => void) => {
    if (!token) return;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${API_BASE}/api/composio/status/${ORG_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const slack = (data.connections as ComposioConnection[])?.find(
        (c) => c.app_name === appName
      ) ?? null;
      setState((prev) => ({ ...prev, conn: slack }));
    } catch { /* ignore */ }
    finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    void loadComposioStatus("slack", setSlackState);
    void loadComposioStatus("gcal", setCalendarState);
  }, [token]);

  // When the user returns from the OAuth tab, re-check status automatically
  useEffect(() => {
    const handleFocus = () => {
      void loadComposioStatus("slack", setSlackState);
      void loadComposioStatus("gcal", setCalendarState);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [token]);

  const connectComposioApp = async (
    appName: string,
    setState: (updater: (prev: IntegrationState) => IntegrationState) => void,
  ) => {
    if (!token) return;
    setState((prev) => ({ ...prev, connecting: true, connectError: null }));
    try {
      const res = await fetch(`${API_BASE}/api/composio/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ app_name: appName, org_id: ORG_ID }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setState((prev) => ({
          ...prev,
          connectError: err.detail ?? `Error ${res.status}: ${res.statusText}`,
        }));
        return;
      }
      const data = await res.json();
      if (data.redirect_url) {
        window.open(data.redirect_url, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => {
        void loadComposioStatus(appName, setState);
      }, 5000);
    } catch (e) {
      setState((prev) => ({
        ...prev,
        connectError: `Network error — is the backend running on port 8000?`,
      }));
    } finally {
      setState((prev) => ({ ...prev, connecting: false }));
    }
  };

  // Trigger Slack sync
  const triggerSync = async () => {
    if (!token) return;
    setSlackState((prev) => ({ ...prev, syncing: true, syncResult: null }));
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
        setSlackState((prev) => ({ ...prev, syncResult: err.detail ?? "Sync failed — check backend logs." }));
        return;
      }
      setSlackState((prev) => ({ ...prev, syncResult: "Sync started! Sentiment analysis will run in the background." }));
      void loadComposioStatus("slack", setSlackState);
    } catch {
      setSlackState((prev) => ({ ...prev, syncResult: "Network error — is the backend running?" }));
    } finally {
      setSlackState((prev) => ({ ...prev, syncing: false }));
    }
  };

  const slackIsActive = Boolean(slackState.conn?.is_active);
  const slackIsPending = Boolean(
    slackState.conn &&
    !slackState.conn.is_active &&
    ((slackState.conn.is_pending === true) || (slackState.conn.connection_status || "").toUpperCase() === "INITIATED")
  );

  const calendarIsActive = Boolean(calendarState.conn?.is_active);
  const calendarIsPending = Boolean(
    calendarState.conn &&
    !calendarState.conn.is_active &&
    ((calendarState.conn.is_pending === true) || (calendarState.conn.connection_status || "").toUpperCase() === "INITIATED")
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
              {slackState.loading ? (
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
                {slackState.conn?.last_synced_at && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(slackState.conn.last_synced_at).toLocaleString()}
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={() => void triggerSync()}
                    disabled={slackState.syncing}
                    className="flex items-center gap-2"
                  >
                    {slackState.syncing
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
                      : <><RefreshCw className="h-4 w-4" /> Sync now</>
                    }
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadComposioStatus("slack", setSlackState)}>
                    Refresh status
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={() => void connectComposioApp("slack", setSlackState)}
                  disabled={slackState.connecting}
                  className="flex items-center gap-2"
                >
                  {slackState.connecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening OAuth…</>
                    : "Connect Slack"
                  }
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={slackState.loading}
                  onClick={() => void loadComposioStatus("slack", setSlackState)}
                  className="flex items-center gap-2"
                >
                  {slackState.loading
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Checking…</>
                    : <><RefreshCw className="h-3 w-3" /> Refresh status</>
                  }
                </Button>
              </div>
            )}
            {slackState.syncResult && (
              <p className="text-xs text-muted-foreground border border-muted bg-muted/30 p-2">{slackState.syncResult}</p>
            )}
            {slackState.connectError && (
              <p className="text-xs text-red-600 border border-red-200 bg-red-50 p-2">{slackState.connectError}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-foreground shadow-[2px_2px_0px_#000]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-[#F5C518] text-black text-xs font-black">
                  <Calendar className="h-4 w-4" />
                </span>
                Google Calendar
              </span>
              {calendarState.loading ? (
                <Skeleton className="h-5 w-24" />
              ) : calendarIsActive ? (
                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : calendarIsPending ? (
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
            {calendarIsActive ? (
              <>
                {calendarState.conn?.last_synced_at && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(calendarState.conn.last_synced_at).toLocaleString()}
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={() => void connectComposioApp("gcal", setCalendarState)}
                    disabled={calendarState.connecting}
                    className="flex items-center gap-2"
                  >
                    {calendarState.connecting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening OAuth…</>
                      : "Reconnect Calendar"
                    }
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadComposioStatus("gcal", setCalendarState)}>
                    Refresh status
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={() => void connectComposioApp("gcal", setCalendarState)}
                  disabled={calendarState.connecting}
                  className="flex items-center gap-2"
                >
                  {calendarState.connecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening OAuth…</>
                    : "Connect Google Calendar"
                  }
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={calendarState.loading}
                  onClick={() => void loadComposioStatus("gcal", setCalendarState)}
                  className="flex items-center gap-2"
                >
                  {calendarState.loading
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Checking…</>
                    : <><RefreshCw className="h-3 w-3" /> Refresh status</>
                  }
                </Button>
              </div>
            )}
            {calendarState.connectError && (
              <p className="text-xs text-red-600 border border-red-200 bg-red-50 p-2">{calendarState.connectError}</p>
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
      </div>
    </div>
  );
}
