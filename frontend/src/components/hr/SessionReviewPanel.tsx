import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { LineChart, CartesianGrid, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type PendingSession = {
  id: string;
  employee_id: string;
  department?: string;
  scheduled_date: string;
  status: string;
  hr_reviewed: boolean;
};

type SessionResults = {
  id: string;
  employee_id: string;
  recording_url?: string | null;
  transcript: string;
  emotion_timeline: Array<{ segment: string; stress: number; confidence: number }>;
  emotion_analysis: { red_flags?: string[]; key_themes?: string[] };
  derived_scores: Record<string, number>;
  hr_summary: string;
};

export default function SessionReviewPanel() {
  const { token } = useAuth();
  const [pending, setPending] = useState<PendingSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => pending.find((s) => s.id === selectedId) ?? null,
    [pending, selectedId],
  );

  const fetchPending = async () => {
    if (!token) return;
    const res = await fetch('/api/feedback/sessions/pending-review', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setPending(data.sessions || []);
    if (!selectedId && data.sessions?.length) {
      setSelectedId(data.sessions[0].id);
    }
  };

  const fetchResults = async (id: string) => {
    if (!token) return;
    const res = await fetch(`/api/feedback/sessions/${id}/results`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as SessionResults;
    setResults(data);
  };

  useEffect(() => {
    void fetchPending();
  }, [token]);

  useEffect(() => {
    if (selectedId) {
      void fetchResults(selectedId);
    }
  }, [selectedId, token]);

  const ingest = async () => {
    if (!token || !selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/feedback/sessions/${selectedId}/hr-ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        throw new Error('Failed to ingest session');
      }
      setNotes('');
      await fetchPending();
      setResults(null);
      setSelectedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to ingest');
    } finally {
      setBusy(false);
    }
  };

  const redFlags = results?.emotion_analysis?.red_flags ?? [];

  const transcriptWithHighlights = useMemo(() => {
    const text = results?.transcript || '';
    if (!text) return '';
    let output = text;
    redFlags.forEach((flag) => {
      if (!flag) return;
      const pattern = new RegExp(`(${flag.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})`, 'ig');
      output = output.replace(pattern, '[[[HIGHLIGHT]]]$1[[[/HIGHLIGHT]]]');
    });
    return output;
  }, [results?.transcript, redFlags]);

  const transcriptParts = transcriptWithHighlights.split(/(\[\[\[HIGHLIGHT\]\]\].*?\[\[\[\/HIGHLIGHT\]\]\])/g);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle>Pending Sessions ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full text-left rounded border p-3 ${selectedId === item.id ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <p className="font-medium">{item.employee_id}</p>
              <p className="text-xs text-muted-foreground">Due: {new Date(item.scheduled_date).toLocaleDateString()}</p>
              <div className="mt-2">
                <Badge variant="secondary">{item.status}</Badge>
              </div>
            </button>
          ))}
          {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending sessions to review.</p>}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Session Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected && <p className="text-sm text-muted-foreground">Select a session to review.</p>}

          {results && (
            <>
              {results.recording_url ? (
                <video controls className="w-full rounded border" src={results.recording_url} />
              ) : (
                <p className="text-sm text-muted-foreground">Recording URL unavailable.</p>
              )}

              <div>
                <h3 className="font-semibold mb-2">Emotion Timeline</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.emotion_timeline || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="segment" />
                      <YAxis domain={[0, 1]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="stress" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="confidence" stroke="#22c55e" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Derived Scores</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(results.derived_scores || {}).map(([key, value]) => (
                    <div key={key} className="rounded border p-3">
                      <p className="text-xs text-muted-foreground mb-1">{key.replace(/_/g, ' ')}</p>
                      <Progress value={Math.round(Number(value) * 100)} />
                      <p className="text-xs mt-1 font-medium">{Number(value).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Transcript</h3>
                <div className="rounded border p-3 text-sm whitespace-pre-wrap leading-relaxed">
                  {transcriptParts.map((part, i) => {
                    if (part.startsWith('[[[HIGHLIGHT]]]') && part.endsWith('[[[/HIGHLIGHT]]]')) {
                      const inner = part.replace('[[[HIGHLIGHT]]]', '').replace('[[[/HIGHLIGHT]]]', '');
                      return <span key={i} className="bg-red-100 text-red-800 font-semibold px-0.5">{inner}</span>;
                    }
                    return <span key={i}>{part}</span>;
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Groq HR Summary</h3>
                <p className="text-sm text-muted-foreground">{results.hr_summary}</p>
              </div>

              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional HR notes before ingestion..."
                />
                <Button onClick={ingest} disabled={busy}>{busy ? 'Ingesting...' : 'Ingest into NOVA Analytics'}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
