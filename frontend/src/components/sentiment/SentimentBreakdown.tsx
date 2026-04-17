import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import { Clock, TrendingUp, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SentimentBreakdownProps {
  text: string;
  employeeName?: string;
  emotionBreakdown?: Record<string, number> | null;
}

const EMOTION_KEYS = [
  "joy",
  "trust",
  "fear",
  "surprise",
  "sadness",
  "disgust",
  "anger",
  "anticipation",
];

function normalizeEmotions(source: Record<string, number> | null | undefined): SentimentEmotions | null {
  if (!source) return null;
  const normalized = EMOTION_KEYS.map((key) => {
    const raw = source[key] ?? 0;
    const clamped = Math.max(0, Math.min(1, raw));
    return clamped * 100;
  });
  return EMOTION_KEYS.reduce((acc, key, index) => {
    acc[key] = normalized[index];
    return acc;
  }, {} as SentimentEmotions);
}

type SentimentEmotions = Record<string, number>;

function inferFallbackEmotions(text: string): SentimentEmotions {
  const lower = text.toLowerCase();
  const hasNegative = /stress|burnout|frustrat|angry|overwhelm|quit|leave/.test(lower);
  const hasPositive = /great|happy|excited|support|growth|good|motivat/.test(lower);
  return {
    joy: hasPositive ? 62 : 28,
    trust: hasPositive ? 58 : 33,
    fear: hasNegative ? 64 : 18,
    surprise: 26,
    sadness: hasNegative ? 57 : 20,
    disgust: hasNegative ? 48 : 15,
    anger: hasNegative ? 54 : 16,
    anticipation: hasPositive ? 52 : 29,
  };
}

function inferTopics(text: string): Array<{ topic: string; count: number; sentiment: 'positive' | 'negative' | 'neutral' }> {
  const keywords = [
    { topic: 'workload', pattern: /workload|deadline|pressure|overtime|burnout/, sentiment: 'negative' as const },
    { topic: 'management', pattern: /manager|leadership|direction|1:1|support/, sentiment: 'neutral' as const },
    { topic: 'growth', pattern: /growth|career|promotion|learning|mentor/, sentiment: 'positive' as const },
    { topic: 'compensation', pattern: /salary|pay|raise|compensation/, sentiment: 'negative' as const },
    { topic: 'culture', pattern: /culture|team|collaboration|respect|inclusion/, sentiment: 'positive' as const },
  ];

  const lower = text.toLowerCase();
  const derived = keywords
    .map((item) => ({
      topic: item.topic,
      sentiment: item.sentiment,
      count: (lower.match(new RegExp(item.pattern.source, 'g')) || []).length,
    }))
    .filter((item) => item.count > 0);

  if (derived.length > 0) return derived;
  return [
    { topic: 'general sentiment', count: 1, sentiment: 'neutral' },
    { topic: 'workload', count: 1, sentiment: 'negative' },
    { topic: 'team collaboration', count: 1, sentiment: 'positive' },
  ];
}

export default function SentimentBreakdown({ text, employeeName, emotionBreakdown }: SentimentBreakdownProps) {
  const fallbackEmotions = inferFallbackEmotions(text);
  const modelEmotions = normalizeEmotions(emotionBreakdown);
  const emotions = modelEmotions ?? fallbackEmotions;
  const topics = inferTopics(text);

  // Convert emotions object to array for radar chart
  const emotionData = Object.entries(emotions).map(([emotion, value]) => ({
    emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    value: value,
    fullMark: 100,
  }));

  // Determine urgency based on sentiment analysis
  const calculateUrgency = (): { level: string; color: string; responseTime: string } => {
    const negativeIntensity = (emotions.fear + emotions.sadness + emotions.disgust + emotions.anger) / 4;
    
    if (negativeIntensity > 15 || emotions.anger > 20) {
      return { level: 'Critical', color: 'bg-red-500', responseTime: 'Within 24 hours' };
    } else if (negativeIntensity > 10) {
      return { level: 'High', color: 'bg-orange-500', responseTime: 'Within 2-3 days' };
    } else if (negativeIntensity > 5) {
      return { level: 'Medium', color: 'bg-yellow-500', responseTime: 'Within 1 week' };
    }
    return { level: 'Low', color: 'bg-green-500', responseTime: 'Standard follow-up' };
  };

  const urgency = calculateUrgency();

  const getTopicBadgeVariant = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'default';
      case 'negative': return 'destructive';
      default: return 'secondary';
    }
  };

  const getTopicIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '+';
      case 'negative': return '-';
      default: return '=';
    }
  };

  // Calculate overall sentiment score
  const overallSentiment = ((emotions.joy + emotions.trust + emotions.anticipation) / 3 - 
    (emotions.fear + emotions.sadness + emotions.anger) / 3 + 50).toFixed(0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
          <p className="font-semibold">{payload[0].payload.emotion}</p>
          <p className="text-sm text-blue-600">{payload[0].value.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Overall Sentiment Score */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Overall Sentiment Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Sentiment Score</p>
              <p className="text-4xl font-bold" style={{ 
                color: parseInt(overallSentiment) >= 60 ? '#22c55e' : 
                       parseInt(overallSentiment) >= 40 ? '#eab308' : '#ef4444' 
              }}>
                {overallSentiment}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${urgency.color}`}></div>
                <Badge className={urgency.color}>
                  {urgency.level} Priority
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{urgency.responseTime}</span>
              </div>
            </div>
          </div>
          
          {employeeName && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Employee Context:</strong> This feedback is from {employeeName}. 
                <span className="ml-1">Check historical sentiment trend for patterns.</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emotion Wheel - Radar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Emotion Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={emotionData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis 
                dataKey="emotion" 
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Radar
                name="Emotion Intensity"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.5}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>

          {/* Emotion Legend with Values */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Object.entries(emotions).map(([emotion, value]) => (
              <div key={emotion} className="flex items-center justify-between">
                <span className="text-sm capitalize text-muted-foreground">{emotion}</span>
                <div className="flex items-center gap-2">
                  <Progress value={value} className="w-20 h-2" />
                  <span className="text-sm font-medium w-8">{value.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Topic Extraction */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Extracted Topics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topics.map((topic, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{getTopicIcon(topic.sentiment)}</span>
                  <div>
                    <p className="font-medium capitalize">{topic.topic}</p>
                    <p className="text-xs text-muted-foreground">
                      Mentioned {topic.count} time{topic.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <Badge variant={getTopicBadgeVariant(topic.sentiment)}>
                  {topic.sentiment}
                </Badge>
              </div>
            ))}
          </div>

          {/* Top Concerns */}
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 mb-1">Top Concerns</p>
                <p className="text-sm text-amber-800">
                  Primary issues: {topics
                    .filter(t => t.sentiment === 'negative')
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3)
                    .map(t => t.topic)
                    .join(', ')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommended Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recommended HR Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {urgency.level === 'Critical' && (
              <>
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm font-semibold text-red-800">Immediate Response Required</p>
                  <p className="text-sm text-red-700 mt-1">Schedule urgent 1:1 meeting within 24 hours</p>
                </div>
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <p className="text-sm text-orange-800">Loop in employee's manager and HR business partner</p>
                </div>
              </>
            )}
            
            {topics.filter(t => t.sentiment === 'negative').map((topic, i) => (
              <div key={i} className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm">
                  <strong>{topic.topic}:</strong> {getActionForTopic(topic.topic)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to map topics to actions
function getActionForTopic(topic: string): string {
  const actions: Record<string, string> = {
    'workload': 'Review project assignments and consider workload rebalancing',
    'management': 'Facilitate manager-employee relationship coaching',
    'compensation': 'Schedule compensation review against market benchmarks',
    'career growth': 'Discuss career development plan and promotion timeline',
    'work-life balance': 'Explore flexible work arrangements or PTO policy',
    'team collaboration': 'Organize team-building activities',
    'recognition': 'Implement recognition program or peer appreciation initiative',
  };
  
  return actions[topic] || 'Follow up with targeted discussion';
}
