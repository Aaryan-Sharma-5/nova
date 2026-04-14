import { Button } from '@/components/ui/button';
import SessionReviewPanel from '@/components/hr/SessionReviewPanel';
import { useAuth } from '@/contexts/AuthContext';
import { protectedPostApi } from '@/lib/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function HRSessionsReviewPage() {
  useDocumentTitle('NOVA — Sessions to Review');
  const { token } = useAuth();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions to Review</h1>
          <p className="text-sm text-muted-foreground">Track scheduled/in-progress sessions and review completed mandatory feedback sessions for ingestion.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              if (!token) return;
              await protectedPostApi('/api/feedback/sessions/seed-demo', token, {});
              window.location.reload();
            }}
          >
            Load Demo Reviews
          </Button>
        </div>
      </div>
      <SessionReviewPanel />
    </div>
  );
}
