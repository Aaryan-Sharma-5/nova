import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type AuditLogItem = {
  id: string;
  timestamp: string;
  user_id: string;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  reason: string | null;
  ip_address: string;
};

type AuditLogResponse = {
  items: AuditLogItem[];
  count: number;
};

export default function AuditLogPage() {
  useDocumentTitle('NOVA — Audit Logs');
  const { token } = useAuth();
  const [rows, setRows] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;

    async function loadLogs() {
      if (!token) {
        return;
      }

      setLoading(true);
      try {
        const data = await protectedGetApi<AuditLogResponse>("/api/audit/logs?limit=500", token);
        if (mounted) {
          setRows(data.items);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setRows([]);
          setError(err instanceof Error ? err.message : "Failed to load audit logs");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadLogs();

    return () => {
      mounted = false;
    };
  }, [token]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (actionFilter !== "all" && row.action !== actionFilter) {
        return false;
      }
      if (resourceFilter !== "all" && row.resource_type !== resourceFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const blob = [
        row.user_id,
        row.user_role,
        row.action,
        row.resource_type,
        row.resource_id,
        row.reason || "",
        row.ip_address,
      ]
        .join(" ")
        .toLowerCase();

      return blob.includes(q);
    });
  }, [rows, search, actionFilter, resourceFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Leadership access log for sensitive data reads.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          placeholder="Search user, resource, reason, IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>

        <Select value={resourceFilter} onValueChange={setResourceFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            <SelectItem value="employees">Employees</SelectItem>
            <SelectItem value="scores">Scores</SelectItem>
            <SelectItem value="interventions">Interventions</SelectItem>
            <SelectItem value="resource">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="p-4">
        {loading && <p className="text-sm text-muted-foreground">Loading logs...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && (
          <>
            <p className="text-xs text-muted-foreground mb-3">{filteredRows.length} events</p>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Resource</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{row.user_id}</td>
                      <td className="px-3 py-2 uppercase text-xs">{row.user_role}</td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2">
                        {row.resource_type} / {row.resource_id}
                      </td>
                      <td className="px-3 py-2">{row.reason || "-"}</td>
                      <td className="px-3 py-2">{row.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
