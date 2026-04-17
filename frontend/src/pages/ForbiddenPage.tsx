import { Link, useLocation } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function ForbiddenPage() {
  useDocumentTitle('NOVA — Access Denied');
  const location = useLocation();
  const attempted = (location.state as { from?: string } | null)?.from ?? "unknown route";

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-6">
      <div className="chart-container max-w-lg text-center space-y-4">
        <h1 className="text-3xl font-bold">403</h1>
        <p className="text-lg font-semibold">Access denied for this route.</p>
        <p className="text-sm text-muted-foreground">Attempted path: {attempted}</p>
        <Link to="/org-health" className="underline text-foreground font-semibold">
          Go to Org Info
        </Link>
      </div>
    </div>
  );
}
