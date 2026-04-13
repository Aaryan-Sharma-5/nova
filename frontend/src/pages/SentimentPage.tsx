import { useMemo, useState } from 'react';
import { SentimentAnalyzer } from '@/components/sentiment/SentimentAnalyzer';
import WordCloud from '@/components/sentiment/WordCloud';
import { SentimentResult } from '@/types/employee';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';

const EMOTION_DIMENSIONS = [
  'stress',
  'frustration',
  'disengagement',
  'satisfaction',
  'enthusiasm',
  'anxiety',
] as const;

const EMOTION_SHIFT_THRESHOLD = 0.3;

export default function SentimentPage() {
  const [latestResult, setLatestResult] = useState<SentimentResult | null>(null);

  const radarData = useMemo(() => {
    const emotions = latestResult?.emotions;
    if (!emotions) {
      return [];
    }

    return EMOTION_DIMENSIONS.map((emotion) => ({
      emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
      value: Number(emotions[emotion] ?? 0),
      fullMark: 1,
    }));
  }, [latestResult]);

  const shiftAlerts = useMemo(() => {
    const deltas = latestResult?.trend_delta_7d;
    if (!deltas) {
      return [] as string[];
    }

    return EMOTION_DIMENSIONS
      .filter((emotion) => Math.abs(Number(deltas[emotion] ?? 0)) > EMOTION_SHIFT_THRESHOLD)
      .map((emotion) => {
        const delta = Number(deltas[emotion] ?? 0);
        const direction = delta > 0 ? 'increased' : 'decreased';
        return `${emotion.charAt(0).toUpperCase() + emotion.slice(1)} ${direction} by ${Math.abs(delta).toFixed(2)} in 7 days`;
      });
  }, [latestResult]);

  return (
    <div className="space-y-6">
      <SentimentAnalyzer onResultChange={setLatestResult} />

      {radarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Emotion Radar (6-Dimension Spectrum)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="emotion" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <RechartsTooltip formatter={(value: number) => value.toFixed(2)} />
                  <Radar
                    name="Emotion Intensity"
                    dataKey="value"
                    stroke="#0f766e"
                    fill="#14b8a6"
                    fillOpacity={0.5}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {shiftAlerts.length > 0 && (
        <Alert variant="destructive" className="border-2">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Emotion Shift Alert</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1">
              {shiftAlerts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {latestResult?.sarcasm_confidence !== undefined && latestResult.sarcasm_confidence > 0.6 && (
        <TooltipProvider>
          <div className="flex items-center justify-start">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="cursor-help">
                  Sarcasm Detected
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Positive language flagged as likely sarcastic — adjusted score applied
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}

      <WordCloud />
    </div>
  );
}
