import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi } from "@/lib/api";

type WordCloudItem = {
  text: string;
  value: number;
  sentiment: 'positive' | 'negative' | 'neutral';
};

type FeedbackListPayload = {
  items: Array<{ raw_text?: string; department?: string; sentiment_score?: number }>;
};

interface WordCloudProps {
  department?: string;
}

export default function WordCloud({ department }: WordCloudProps) {
  const { token } = useAuth();
  const [selectedDept, setSelectedDept] = useState<string>(department || "all");
  const [selectedWord, setSelectedWord] = useState<WordCloudItem | null>(null);
  const [feedbackWords, setFeedbackWords] = useState<WordCloudItem[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setFeedbackWords([]);
        return;
      }

      try {
        const params = new URLSearchParams({ page_size: '100' });
        if (selectedDept !== 'all') {
          params.append('department', selectedDept);
        }
        const payload = await protectedGetApi<FeedbackListPayload>(`/api/hr/feedbacks?${params.toString()}`, token);
        const words = new Map<string, { count: number; score: number }>();

        for (const item of payload.items || []) {
          const text = String(item.raw_text || '').toLowerCase();
          const sentiment = Number(item.sentiment_score ?? 0);
          const tokens = text.match(/[a-z]{4,}/g) || [];
          for (const token of tokens) {
            if (['that', 'with', 'have', 'this', 'from', 'they', 'there', 'about'].includes(token)) continue;
            const existing = words.get(token) || { count: 0, score: 0 };
            existing.count += 1;
            existing.score += sentiment;
            words.set(token, existing);
          }
        }

        const computed = Array.from(words.entries())
          .map(([text, value]) => ({
            text,
            value: value.count,
            sentiment: value.score > 0.2 ? 'positive' as const : value.score < -0.2 ? 'negative' as const : 'neutral' as const,
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 50);

        setFeedbackWords(computed);
      } catch {
        setFeedbackWords([]);
      }
    };

    void load();
  }, [token, selectedDept]);

  const data = useMemo<WordCloudItem[]>(() => feedbackWords, [feedbackWords]);

  const getWordColor = (sentiment: WordCloudItem['sentiment']): string => {
    switch (sentiment) {
      case 'positive': return 'text-green-500 hover:text-green-400';
      case 'negative': return 'text-red-500 hover:text-red-400';
      default: return 'text-muted-foreground hover:text-foreground';
    }
  };

  const getWordSize = (value: number): number => {
    // Scale word size based on value (normalize to 12-48px range)
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    return 12 + ((value - minValue) / (maxValue - minValue)) * 36;
  };

  // Mock feedback data for selected word
  const getFeedbackForWord = (word: string): string[] => {
    return [
      `"I feel ${word} by the current workload and expectations."`,
      `"The team dynamics make me feel ${word} about coming to work."`,
      `"Recent changes have left me feeling quite ${word}."`,
      `"Management decisions seem to make everyone ${word}."`,
      `"The new policies are making people feel ${word}."`,
    ];
  };

  return (
    <>
      <Card className="col-span-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Sentiment Word Cloud</CardTitle>
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Organization-wide</SelectItem>
              <SelectItem value="Engineering">Engineering</SelectItem>
              <SelectItem value="Sales">Sales</SelectItem>
              <SelectItem value="Marketing">Marketing</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-lg p-8 min-h-[400px] flex flex-wrap items-center justify-center gap-4 border"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            {data.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                No feedback data yet. Word cloud will populate from HR survey responses.
              </p>
            )}
            {data.map((word, i) => (
              <button
                key={i}
                className={`font-bold transition-all hover:scale-110 cursor-pointer ${getWordColor(word.sentiment)}`}
                style={{ 
                  fontSize: `${getWordSize(word.value)}px`,
                  lineHeight: 1.2,
                }}
                onClick={() => setSelectedWord(word)}
                aria-label={`${word.text}: ${word.value} mentions, ${word.sentiment} sentiment`}
              >
                {word.text}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-600"></div>
              <span className="text-sm text-muted-foreground">Positive</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-600"></div>
              <span className="text-sm text-muted-foreground">Neutral</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-600"></div>
              <span className="text-sm text-muted-foreground">Negative</span>
            </div>
          </div>

          {/* Top Words Summary */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg border" style={{ backgroundColor: 'color-mix(in srgb, #22c55e 12%, var(--bg-card))', borderColor: 'color-mix(in srgb, #22c55e 45%, transparent)' }}>
              <p className="text-sm font-semibold text-green-800 mb-2">Top Positive</p>
              <div className="space-y-1">
                {data
                  .filter(w => w.sentiment === 'positive')
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 3)
                  .map((word, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-green-700">{word.text}</span>
                      <Badge variant="outline" className="text-green-700 border-green-300">
                        {word.value}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>

            <div className="text-center p-4 rounded-lg border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <p className="text-sm font-semibold text-gray-800 mb-2">Top Neutral</p>
              <div className="space-y-1">
                {data
                  .filter(w => w.sentiment === 'neutral')
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 3)
                  .map((word, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{word.text}</span>
                      <Badge variant="outline" className="text-gray-700 border-gray-300">
                        {word.value}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>

            <div className="text-center p-4 rounded-lg border" style={{ backgroundColor: 'color-mix(in srgb, #ef4444 12%, var(--bg-card))', borderColor: 'color-mix(in srgb, #ef4444 45%, transparent)' }}>
              <p className="text-sm font-semibold text-red-800 mb-2">Top Negative</p>
              <div className="space-y-1">
                {data
                  .filter(w => w.sentiment === 'negative')
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 3)
                  .map((word, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-red-700">{word.text}</span>
                      <Badge variant="outline" className="text-red-700 border-red-300">
                        {word.value}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {data.length > 0 && (
            <div className="mt-4 p-3 border rounded-md" style={{ backgroundColor: 'var(--alert-banner-bg)', borderColor: 'var(--border-color)' }}>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                <strong>Key Themes:</strong> Showing {data.length} terms extracted from {data.reduce((s, w) => s + w.value, 0)} HR feedback responses.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Word Detail Dialog */}
      <Dialog open={!!selectedWord} onOpenChange={() => setSelectedWord(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span 
                className="text-3xl font-bold"
                style={{ 
                  color: selectedWord?.sentiment === 'positive' ? '#16a34a' :
                         selectedWord?.sentiment === 'negative' ? '#dc2626' : '#4b5563'
                }}
              >
                {selectedWord?.text}
              </span>
              <Badge 
                variant={selectedWord?.sentiment === 'positive' ? 'default' : 
                        selectedWord?.sentiment === 'negative' ? 'destructive' : 'secondary'}
              >
                {selectedWord?.sentiment}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          {selectedWord && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Frequency</p>
                <p className="text-2xl font-bold">{selectedWord.value} mentions</p>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-3">
                  Example Feedback Containing "{selectedWord.text}"
                </p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {getFeedbackForWord(selectedWord.text).map((feedback, i) => (
                    <div key={i} className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                      <p className="text-sm italic">{feedback}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>• Engineering Dept</span>
                        <span>• 3 days ago</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Click on individual feedback items to view full employee profiles and context.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
