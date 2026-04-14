import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { protectedGetApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

interface BackendEndpointPageProps {
  title: string;
  endpoint: string;
  description?: string;
}

export default function BackendEndpointPage({ title, endpoint, description }: BackendEndpointPageProps) {
  useDocumentTitle(`NOVA — ${title}`);
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);

  const json = useMemo(() => {
    if (!data) {
      return "";
    }
    return JSON.stringify(data, null, 2);
  }, [data]);

  async function fetchEndpoint() {
    if (!token) {
      setError("No token available");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await protectedGetApi<unknown>(endpoint, token);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch endpoint");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchEndpoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, token]);

  return (
    <div className="space-y-4">
      <div className="chart-container">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold font-heading">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description ?? "Live response from backend endpoint"}</p>
            <p className="text-xs mt-2 font-data">GET {endpoint}</p>
          </div>
          <Button size="sm" onClick={() => void fetchEndpoint()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="chart-container border-destructive">
          <p className="font-semibold text-destructive">Request failed</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        <div className="chart-container overflow-auto">
          <pre className="text-xs md:text-sm whitespace-pre-wrap break-words font-data">{json || "No response"}</pre>
        </div>
      )}
    </div>
  );
}
