import { useState } from 'react';
import { analyzeSentiment, getSentimentEmoji, calculateUrgencyLevel, extractInsights } from '@/utils/sentimentAnalysis';
import { SentimentResult } from '@/types/employee';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquareText, Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, Clock, Lightbulb } from 'lucide-react';
import SentimentBreakdown from './SentimentBreakdown';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployees } from '@/contexts/EmployeeContext';
import { API_BASE_URL } from '@/lib/api';

const SAMPLE_TEXTS = [
  "I'm really enjoying the new project. The team is fantastic and I feel motivated every day. Great leadership!",
  "Work is okay, nothing special. Some days are good, some are challenging. The role meets my basic expectations.",
  "I'm feeling overwhelmed and stressed. The constant overtime and pressure is leading to burnout. I dread Mondays.",
  "The company culture is amazing! I feel valued, supported, and excited about growth opportunities here.",
  "Frustrated with the lack of direction. Management seems disconnected. Considering my options elsewhere.",
  "I'm not unhappy with the team, but I'm very stressed with the workload and thinking of looking for other opportunities.",
];

export function SentimentAnalyzer() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<ReturnType<typeof calculateUrgencyLevel> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();
  const { employees } = useEmployees();

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError(null);

    if (!token) {
      setError('Please sign in to analyze sentiment.');
      setAnalyzing(false);
      return;
    }

    try {
      const employeeId = employees[0]?.id ?? 'EMP0001';
      const requestUrl = API_BASE_URL ? `${API_BASE_URL}/api/ai/sentiment` : '/api/ai/sentiment';
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employee_id: employeeId, texts: [text] }),
      });

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const payload = await response.json();
          if (payload?.detail) {
            message = String(payload.detail);
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      const payload = await response.json();
      const mapped: SentimentResult = {
        score: typeof payload.score === 'number' ? payload.score : 0,
        label: payload.label === 'positive' ? 'Positive' : payload.label === 'negative' ? 'Negative' : 'Neutral',
        confidence: typeof payload.confidence === 'number' ? Math.round(payload.confidence * 100) : 0,
        keywords: [],
        metadata: {
          attritionRisk: false,
          mentalHealthConcern: false,
          criticalIssue: false,
          textLength: text.split(/\s+/).length,
          wordCount: text.split(/\s+/).length,
        },
      };

      setResult(mapped);
      setInsights(extractInsights(mapped, text));
      setUrgency(calculateUrgencyLevel(mapped));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze sentiment.');
      const fallback = analyzeSentiment(text);
      setResult(fallback);
      setInsights(extractInsights(fallback, text));
      setUrgency(calculateUrgencyLevel(fallback));
    } finally {
      setAnalyzing(false);
    }
  };

  const loadSample = (sample: string) => {
    setText(sample);
    setResult(null);
    setInsights([]);
    setUrgency(null);
  };

  const scoreColor = result
    ? result.label === 'Positive' ? 'text-risk-low'
    : result.label === 'Negative' ? 'text-risk-high'
    : 'text-muted-foreground'
    : '';

  const ScoreIcon = result?.label === 'Positive' ? TrendingUp : result?.label === 'Negative' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Input area */}
      <div className="chart-container space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Analyze Employee Feedback</h3>
        </div>

        <Textarea
          value={text}
          onChange={e => { 
            setText(e.target.value); 
            setResult(null); 
            setInsights([]); 
            setUrgency(null); 
          }}
          placeholder="Paste employee feedback here to analyze sentiment..."
          rows={5}
          className="resize-none"
        />

        <div className="flex items-center gap-3">
          <Button onClick={handleAnalyze} disabled={!text.trim() || analyzing} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {analyzing ? 'Analyzing...' : 'Analyze Sentiment'}
          </Button>
          <span className="text-xs text-muted-foreground">or try a sample →</span>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {/* Sample buttons */}
        <div className="flex flex-wrap gap-2">
          {SAMPLE_TEXTS.map((sample, i) => (
            <button
              key={i}
              onClick={() => loadSample(sample)}
              className="rounded-lg border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Sample {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Score card */}
            <div className="chart-container">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Overall Sentiment</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-4xl">{getSentimentEmoji(result.score)}</span>
                    <div>
                      <p className={`text-2xl font-bold ${scoreColor}`}>{result.label}</p>
                      <p className="text-sm text-muted-foreground">
                        Score: <span className="font-semibold tabular-nums">{result.score > 0 ? '+' : ''}{result.score.toFixed(3)}</span>
                        {' · '}Confidence: <span className="font-semibold tabular-nums">{result.confidence}%</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className={`rounded-full p-3 ${
                  result.label === 'Positive' ? 'bg-risk-low/10' :
                  result.label === 'Negative' ? 'bg-risk-high/10' : 'bg-secondary'
                }`}>
                  <ScoreIcon className={`h-6 w-6 ${scoreColor}`} />
                </div>
              </div>

              {/* Score bar */}
              <div className="mt-4">
                <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-risk-high via-risk-medium to-risk-low" style={{ width: '100%' }} />
                  <div
                    className="absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-foreground shadow-md transition-all duration-500"
                    style={{ left: `${((result.score + 1) / 2) * 100}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Very Negative (-1.0)</span>
                  <span>Neutral (0.0)</span>
                  <span>Very Positive (+1.0)</span>
                </div>
              </div>
            </div>

            {/* Critical Flags Alert */}
            {(result.metadata?.criticalIssue || result.metadata?.mentalHealthConcern || result.metadata?.attritionRisk) && (
              <Alert variant="destructive" className="border-2">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle className="text-base font-bold">Critical Indicators Detected</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  {result.metadata?.criticalIssue && (
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="font-semibold">CRITICAL ISSUE</Badge>
                      <span className="text-sm">Potential legal/HR violation detected - escalate immediately</span>
                    </div>
                  )}
                  {result.metadata?.mentalHealthConcern && (
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="font-semibold">MENTAL HEALTH</Badge>
                      <span className="text-sm">Mental health concern identified - provide crisis support resources</span>
                    </div>
                  )}
                  {result.metadata?.attritionRisk && (
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="font-semibold">FLIGHT RISK</Badge>
                      <span className="text-sm">Employee expressing intent to leave - retention intervention needed</span>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Urgency Level */}
            {urgency && (
              <div className="chart-container">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Response Urgency</h4>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${urgency.color}`}></div>
                    <Badge className={urgency.color}>
                      {urgency.level} Priority
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Response Time:</span>
                    <span className="font-medium">{urgency.responseTime}</span>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <span className="font-medium">Recommended Action: </span>
                    {urgency.action}
                  </div>
                </div>
              </div>
            )}

            {/* AI-Generated Insights */}
            {insights.length > 0 && (
              <div className="chart-container">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  <h4 className="text-sm font-semibold">AI-Generated Insights</h4>
                </div>
                <div className="space-y-2">
                  {insights.map((insight, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg text-sm border border-border/50"
                    >
                      <span className="flex-1">{insight}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            <SentimentBreakdown text={text} emotionBreakdown={result.emotion_breakdown} />

            {/* Analysis Metadata */}
            {result.metadata && (
              <div className="chart-container bg-muted/30">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Analysis Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Words Analyzed</p>
                    <p className="text-lg font-bold">{result.metadata.textLength}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sentiment Words</p>
                    <p className="text-lg font-bold">{result.metadata.wordCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Confidence</p>
                    <p className="text-lg font-bold">{result.confidence}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Keywords Found</p>
                    <p className="text-lg font-bold">{result.keywords.length}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Keywords */}
            {result.keywords.length > 0 && (
              <div className="chart-container">
                <h4 className="text-sm font-semibold mb-3">Detected Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {result.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        kw.sentiment === 'positive' ? 'bg-risk-low/15 text-risk-low' :
                        kw.sentiment === 'negative' ? 'bg-risk-high/15 text-risk-high' :
                        'bg-secondary text-muted-foreground'
                      }`}
                      style={{ fontSize: `${Math.max(11, 11 + kw.weight * 3)}px` }}
                    >
                      {kw.word}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
