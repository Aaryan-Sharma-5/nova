import SessionReviewPanel from '@/components/hr/SessionReviewPanel';

export default function HRSessionsReviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sessions to Review</h1>
        <p className="text-sm text-muted-foreground">Review completed mandatory feedback sessions and ingest derived scores into NOVA analytics.</p>
      </div>
      <SessionReviewPanel />
    </div>
  );
}
