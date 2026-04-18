import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { API_BASE_URL } from "@/lib/api";
import { RefreshCw, Loader2, CheckCircle2, XCircle, Calendar } from "lucide-react";

const API_BASE = API_BASE_URL;
const ORG_ID = "default-org";
const GOOGLE_CALENDAR_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? "";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

interface ComposioConnection {
  app_name: string;
  is_active: boolean;
  last_synced_at: string | null;
  connected_at: string | null;
  connection_status?: string;
  is_pending?: boolean;
  redirect_url?: string;
}

interface GoogleCalendarConnection {
  connected: boolean;
  last_sync_at: string | null;
  mode: string;
  connected_at?: string | null;
  expires_at?: string | null;
  calendar_count?: number;
  scope?: string | null;
}

type IntegrationState<TConnection> = {
  conn: TConnection | null;
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

  const [slackState, setSlackState] = useState<IntegrationState<ComposioConnection>>({
    conn: null,
    loading: false,
    connecting: false,
    syncing: false,
    syncResult: null,
    connectError: null,
  });

  const [calendarState, setCalendarState] = useState<IntegrationState<GoogleCalendarConnection>>({
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
        const res = await fetch(`${API_BASE}/api/integrations/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) await res.json();
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, [token]);

  const loadComposioStatus = useCallback(async (
    appName: string,
    setState: (updater: (prev: IntegrationState<ComposioConnection>) => IntegrationState<ComposioConnection>) => void,
  ) => {
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
    } catch {
      // ignore
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [token]);

  const loadGoogleCalendarStatus = useCallback(async () => {
    if (!token) return;
    setCalendarState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${API_BASE}/api/integrations/google-calendar/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as GoogleCalendarConnection;
      setCalendarState((prev) => ({ ...prev, conn: data }));
    } catch {
      // ignore
    } finally {
      setCalendarState((prev) => ({ ...prev, loading: false }));
    }
  }, [token]);

  useEffect(() => {
    void loadComposioStatus("slack", setSlackState);
    void loadGoogleCalendarStatus();
  }, [loadComposioStatus, loadGoogleCalendarStatus]);

  // When the user returns from the OAuth tab, re-check status automatically
  useEffect(() => {
    const handleFocus = () => {
      void loadComposioStatus("slack", setSlackState);
      void loadGoogleCalendarStatus();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadComposioStatus, loadGoogleCalendarStatus]);

  const connectComposioApp = async (
    appName: string,
    setState: (updater: (prev: IntegrationState<ComposioConnection>) => IntegrationState<ComposioConnection>) => void,
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

  const requestGoogleCalendarToken = useCallback(async (): Promise<GoogleTokenResponse> => {
    if (!GOOGLE_CALENDAR_CLIENT_ID) {
      throw new Error("Google Calendar is not configured. Missing VITE_GOOGLE_CALENDAR_CLIENT_ID.");
    }

    const tokenClient = window.google?.accounts?.oauth2?.initTokenClient;
    if (!tokenClient) {
      throw new Error("Google Identity Services failed to load. Refresh the page and try again.");
    }

    return await new Promise<GoogleTokenResponse>((resolve, reject) => {
      const client = tokenClient({
        client_id: GOOGLE_CALENDAR_CLIENT_ID,
        scope: GOOGLE_CALENDAR_SCOPE,
        prompt: "consent",
        include_granted_scopes: true,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || "Google Calendar authorization failed."));
            return;
          }
          resolve(response);
        },
      });

      client.requestAccessToken({ prompt: "consent" });
    });
  }, []);

  const connectGoogleCalendar = async () => {
    if (!token) return;
    setCalendarState((prev) => ({ ...prev, connecting: true, connectError: null }));
    try {
      const auth = await requestGoogleCalendarToken();
      const res = await fetch(`${API_BASE}/api/integrations/google-calendar/connect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          org_id: ORG_ID,
          access_token: auth.access_token,
          expires_in: auth.expires_in,
          scope: auth.scope,
          token_type: auth.token_type,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCalendarState((prev) => ({
          ...prev,
          connectError: err.detail ?? `Error ${res.status}: ${res.statusText}`,
        }));
        return;
      }

      const data = (await res.json()) as GoogleCalendarConnection;
      setCalendarState((prev) => ({ ...prev, conn: data }));
      void loadGoogleCalendarStatus();
    } catch (e) {
      setCalendarState((prev) => ({
        ...prev,
        connectError: e instanceof Error ? e.message : "Unable to connect Google Calendar.",
      }));
    } finally {
      setCalendarState((prev) => ({ ...prev, connecting: false }));
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

  const calendarIsActive = Boolean(calendarState.conn?.connected);

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
                {calendarState.conn?.last_sync_at && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(calendarState.conn.last_sync_at).toLocaleString()}
                  </p>
                )}
                {calendarState.conn?.expires_at && (
                  <p className="text-xs text-muted-foreground">
                    Token expires: {new Date(calendarState.conn.expires_at).toLocaleString()}
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={() => void connectGoogleCalendar()}
                    disabled={calendarState.connecting}
                    className="flex items-center gap-2"
                  >
                    {calendarState.connecting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                      : "Reconnect Calendar"
                    }
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadGoogleCalendarStatus()}>
                    Refresh status
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={() => void connectGoogleCalendar()}
                  disabled={calendarState.connecting}
                  className="flex items-center gap-2"
                >
                  {calendarState.connecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                    : "Connect Google Calendar"
                  }
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={calendarState.loading}
                  onClick={() => void loadGoogleCalendarStatus()}
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
