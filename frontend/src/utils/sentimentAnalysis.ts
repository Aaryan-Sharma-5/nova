import { SentimentResult } from '@/types/employee';

const POSITIVE_WORDS: Record<string, number> = {
  excellent: 1.0, great: 0.8, amazing: 0.9, motivated: 0.8, engaged: 0.7,
  satisfied: 0.7, happy: 0.8, love: 0.9, enjoy: 0.7, fantastic: 0.9,
  productive: 0.7, supported: 0.7, appreciated: 0.8, growing: 0.6,
  collaborative: 0.6, innovative: 0.7, inspiring: 0.8, rewarding: 0.8,
  thriving: 0.9, proud: 0.7, exciting: 0.7, empowered: 0.8, valued: 0.8,
  positive: 0.6, balanced: 0.5, comfortable: 0.5, flexible: 0.6,
  helpful: 0.6, successful: 0.7, opportunity: 0.5, growth: 0.6,
  accomplished: 0.8, energized: 0.7, optimistic: 0.7, passionate: 0.8,
  fulfilled: 0.8, recognized: 0.7, talented: 0.6, efficient: 0.6,
  creative: 0.6, dedicated: 0.6, enthusiastic: 0.8, confident: 0.7,
};

const NEGATIVE_WORDS: Record<string, number> = {
  stressed: -0.8, overwhelmed: -0.9, frustrated: -0.8, burned: -0.9,
  leaving: -1.0, exhausted: -0.9, unhappy: -0.8, underpaid: -0.7,
  toxic: -1.0, micromanaged: -0.8, ignored: -0.7, overworked: -0.9,
  demotivated: -0.8, disconnected: -0.7, boring: -0.5, stagnant: -0.6,
  undervalued: -0.8, anxious: -0.7, unfair: -0.8, quit: -1.0,
  burnout: -0.9, terrible: -0.9, hate: -0.9, awful: -0.9, dread: -0.8,
  miserable: -0.9, resentful: -0.7, unsupported: -0.7, chaotic: -0.7,
  disorganized: -0.6, pressure: -0.6, conflict: -0.6, struggle: -0.5,
  depressed: -0.8, hopeless: -0.9, helpless: -0.8, worthless: -0.9,
  betrayed: -0.8, abandoned: -0.8, isolated: -0.7, trapped: -0.8,
  suffocating: -0.8, mismanaged: -0.7, incompetent: -0.7, nightmare: -0.9,
};

// Negation words that flip sentiment
const NEGATION_WORDS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
  'hardly', 'scarcely', 'barely', 'dont', "don't", 'doesnt', "doesn't",
  'didnt', "didn't", 'wont', "won't", 'wouldnt', "wouldn't", 'cant', "can't",
  'couldnt', "couldn't", 'shouldnt', "shouldn't", 'isnt', "isn't",
  'arent', "aren't", 'wasnt', "wasn't", 'werent', "weren't"
]);

// Intensity modifiers
const INTENSIFIERS: Record<string, number> = {
  very: 1.5, extremely: 2.0, absolutely: 1.8, completely: 1.7,
  totally: 1.6, really: 1.4, quite: 1.3, highly: 1.5,
  incredibly: 1.8, exceptionally: 1.7, particularly: 1.4,
  remarkably: 1.6, extraordinarily: 1.9, utterly: 1.8,
};

const DIMINISHERS: Record<string, number> = {
  somewhat: 0.5, slightly: 0.4, barely: 0.3, hardly: 0.3,
  almost: 0.6, fairly: 0.7, relatively: 0.6, reasonably: 0.7,
  moderately: 0.6, rather: 0.7, pretty: 0.8, kind: 0.6, sort: 0.6,
};

// Critical phrases indicating high attrition risk
const ATTRITION_PHRASES = [
  'looking for other opportunities', 'considering leaving', 'planning to quit',
  'last day', 'two weeks notice', 'resignation', 'job search', 'looking elsewhere',
  'better offer', 'interviewing', 'found another job', 'moving on',
  'had enough', 'done with', 'cannot do this anymore', 'thinking of leaving',
  'update my resume', 'updating resume', 'polish my cv',
];

// Mental health and wellbeing indicators
const MENTAL_HEALTH_KEYWORDS = [
  'suicide', 'kill myself', 'end it all', 'no point', 'depressed',
  'anxiety', 'panic', 'therapy', 'counseling', 'mental health',
  'breakdown', 'crying', 'sleep', 'insomnia', 'medication',
];

// Workplace issues that need immediate attention
const CRITICAL_ISSUES = [
  'harassment', 'discrimination', 'bullying', 'abuse', 'hostile',
  'illegal', 'unsafe', 'violation', 'retaliation', 'threatened',
  'lawsuit', 'lawyer', 'hr complaint', 'report', 'investigation',
];

export function analyzeSentiment(text: string): SentimentResult {
  const lowerText = text.toLowerCase();
  const words = lowerText.replace(/[^\w\s'-]/g, '').split(/\s+/);
  const keywords: SentimentResult['keywords'] = [];
  let totalScore = 0;
  let wordCount = 0;
  
  // Check for critical phrases first
  const criticalFlags = detectCriticalFlags(lowerText);
  
  // Enhanced word-by-word analysis with context
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = i > 0 ? words[i - 1] : '';
    const nextWord = i < words.length - 1 ? words[i + 1] : '';
    
    // Check for negation in previous 2 words
    const isNegated = (
      NEGATION_WORDS.has(prevWord) || 
      (i > 1 && NEGATION_WORDS.has(words[i - 2]))
    );
    
    // Check for intensity modifiers
    let intensityMultiplier = 1.0;
    if (INTENSIFIERS[prevWord]) {
      intensityMultiplier = INTENSIFIERS[prevWord];
    } else if (DIMINISHERS[prevWord]) {
      intensityMultiplier = DIMINISHERS[prevWord];
    }
    
    // Process sentiment words
    if (POSITIVE_WORDS[word]) {
      let wordScore = POSITIVE_WORDS[word] * intensityMultiplier;
      
      // Flip sentiment if negated (e.g., "not happy")
      if (isNegated) {
        wordScore = -Math.abs(wordScore) * 0.8; // Negated positive becomes negative
        keywords.push({ 
          word: `${prevWord} ${word}`, 
          sentiment: 'negative', 
          weight: Math.abs(wordScore) 
        });
      } else {
        keywords.push({ 
          word, 
          sentiment: 'positive', 
          weight: Math.abs(wordScore) 
        });
      }
      
      totalScore += wordScore;
      wordCount++;
      
    } else if (NEGATIVE_WORDS[word]) {
      let wordScore = NEGATIVE_WORDS[word] * intensityMultiplier;
      
      // Double negatives become less negative (e.g., "not terrible")
      if (isNegated) {
        wordScore = Math.abs(wordScore) * 0.3; // Negated negative becomes mildly positive
        keywords.push({ 
          word: `${prevWord} ${word}`, 
          sentiment: 'neutral', 
          weight: Math.abs(wordScore) 
        });
      } else {
        keywords.push({ 
          word, 
          sentiment: 'negative', 
          weight: Math.abs(wordScore) 
        });
      }
      
      totalScore += wordScore;
      wordCount++;
    }
  }
  
  // Adjust score based on critical flags
  if (criticalFlags.attritionRisk) {
    totalScore -= 0.5;
    wordCount += 2;
  }
  
  if (criticalFlags.mentalHealthConcern) {
    totalScore -= 0.7;
    wordCount += 3;
  }
  
  if (criticalFlags.criticalIssue) {
    totalScore -= 1.0;
    wordCount += 4;
  }
  
  // Detect phrase patterns for better accuracy
  const phraseScore = analyzePhrases(lowerText);
  totalScore += phraseScore.score;
  wordCount += phraseScore.count;
  
  // Calculate final score
  const rawScore = wordCount > 0 ? totalScore / wordCount : 0;
  const score = Math.max(-1, Math.min(1, rawScore));
  
  // Enhanced confidence calculation
  let confidence = Math.min(100, wordCount * 12 + 30);
  
  // Boost confidence for longer, more detailed text
  const textLength = text.split(/\s+/).length;
  if (textLength > 50) confidence = Math.min(100, confidence + 10);
  if (textLength > 100) confidence = Math.min(100, confidence + 5);
  
  // Reduce confidence if contradictory signals
  const positiveCount = keywords.filter(k => k.sentiment === 'positive').length;
  const negativeCount = keywords.filter(k => k.sentiment === 'negative').length;
  const contradiction = Math.min(positiveCount, negativeCount) / Math.max(positiveCount, negativeCount, 1);
  if (contradiction > 0.5) {
    confidence *= 0.8; // Reduce confidence when mixed signals
  }
  
  const label = score > 0.15 ? 'Positive' : score < -0.15 ? 'Negative' : 'Neutral';

  // Sort keywords by weight and deduplicate
  const uniqueKeywords = Array.from(
    new Map(keywords.map(k => [k.word, k])).values()
  );
  uniqueKeywords.sort((a, b) => b.weight - a.weight);

  return { 
    score, 
    label, 
    confidence: Math.round(confidence), 
    keywords: uniqueKeywords.slice(0, 15),
    // @ts-ignore - Adding extra metadata for enhanced analysis
    metadata: {
      attritionRisk: criticalFlags.attritionRisk,
      mentalHealthConcern: criticalFlags.mentalHealthConcern,
      criticalIssue: criticalFlags.criticalIssue,
      textLength,
      wordCount,
    }
  };
}

// Detect critical flags in text
function detectCriticalFlags(text: string): {
  attritionRisk: boolean;
  mentalHealthConcern: boolean;
  criticalIssue: boolean;
} {
  return {
    attritionRisk: ATTRITION_PHRASES.some(phrase => text.includes(phrase)),
    mentalHealthConcern: MENTAL_HEALTH_KEYWORDS.some(keyword => text.includes(keyword)),
    criticalIssue: CRITICAL_ISSUES.some(issue => text.includes(issue)),
  };
}

// Analyze common phrases for better context
function analyzePhrases(text: string): { score: number; count: number } {
  let score = 0;
  let count = 0;
  
  const positivePhrases = [
    { phrase: 'love my job', score: 0.9 },
    { phrase: 'great team', score: 0.7 },
    { phrase: 'feel valued', score: 0.8 },
    { phrase: 'work life balance', score: 0.6 },
    { phrase: 'excited about', score: 0.8 },
    { phrase: 'looking forward', score: 0.7 },
    { phrase: 'proud to', score: 0.7 },
    { phrase: 'best place', score: 0.9 },
  ];
  
  const negativePhrases = [
    { phrase: 'hate my job', score: -0.9 },
    { phrase: 'want to quit', score: -1.0 },
    { phrase: 'cannot take', score: -0.8 },
    { phrase: 'had enough', score: -0.9 },
    { phrase: 'no work life balance', score: -0.8 },
    { phrase: 'thinking of leaving', score: -1.0 },
    { phrase: 'looking for new', score: -0.9 },
    { phrase: 'toxic environment', score: -1.0 },
    { phrase: 'worst place', score: -0.9 },
    { phrase: 'no longer care', score: -0.8 },
  ];
  
  for (const { phrase, score: phraseScore } of positivePhrases) {
    if (text.includes(phrase)) {
      score += phraseScore;
      count++;
    }
  }
  
  for (const { phrase, score: phraseScore } of negativePhrases) {
    if (text.includes(phrase)) {
      score += phraseScore;
      count++;
    }
  }
  
  return { score, count };
}

export function getSentimentLabel(score: number): 'Positive' | 'Neutral' | 'Negative' {
  if (score > 0.15) return 'Positive';
  if (score < -0.15) return 'Negative';
  return 'Neutral';
}

export function getSentimentEmoji(score: number): string {
  if (score > 0.5) return 'Very Positive';
  if (score > 0.15) return 'Positive';
  if (score > -0.15) return 'Neutral';
  if (score > -0.5) return 'Negative';
  return 'Very Negative';
}

// Calculate urgency level from sentiment result
export function calculateUrgencyLevel(result: SentimentResult): {
  level: 'Critical' | 'High' | 'Medium' | 'Low';
  color: string;
  responseTime: string;
  action: string;
} {
  const { score, metadata } = result;
  
  // Critical urgency
  if (metadata?.criticalIssue) {
    return {
      level: 'Critical',
      color: 'bg-red-500',
      responseTime: 'Immediate',
      action: 'Escalate to HR leadership and legal immediately'
    };
  }
  
  if (metadata?.mentalHealthConcern) {
    return {
      level: 'Critical',
      color: 'bg-red-500',
      responseTime: 'Within 24 hours',
      action: 'Contact employee personally, offer EAP resources'
    };
  }
  
  if (metadata?.attritionRisk || score < -0.7) {
    return {
      level: 'High',
      color: 'bg-orange-500',
      responseTime: 'Within 2-3 days',
      action: 'Schedule 1-on-1 with manager, assess retention risk'
    };
  }
  
  // High urgency
  if (score < -0.4) {
    return {
      level: 'High',
      color: 'bg-orange-500',
      responseTime: 'Within 1 week',
      action: 'Manager should address concerns in next check-in'
    };
  }
  
  // Medium urgency
  if (score < -0.15 || result.confidence < 50) {
    return {
      level: 'Medium',
      color: 'bg-yellow-500',
      responseTime: 'Within 2 weeks',
      action: 'Monitor situation, include in next team pulse survey'
    };
  }
  
  // Low urgency
  return {
    level: 'Low',
    color: 'bg-green-500',
    responseTime: 'Standard follow-up',
    action: 'Continue regular engagement activities'
  };
}

// Extract actionable insights from sentiment analysis
export function extractInsights(result: SentimentResult, text: string): string[] {
  const insights: string[] = [];
  const lowerText = text.toLowerCase();
  
  // Critical alerts
  if (result.metadata?.criticalIssue) {
    insights.push('CRITICAL: Potential legal/HR violation detected. Immediate escalation required.');
  }
  
  if (result.metadata?.mentalHealthConcern) {
    insights.push('URGENT: Mental health concern identified. Employee may need crisis support.');
  }
  
  if (result.metadata?.attritionRisk) {
    insights.push('HIGH RISK: Employee expressing intent to leave. Retention intervention needed.');
  }
  
  // Specific issue detection
  if (lowerText.includes('manager') && result.score < -0.3) {
    insights.push('Manager relationship issue detected. Consider skip-level meeting.');
  }
  
  if (lowerText.includes('workload') || lowerText.includes('overtime') || lowerText.includes('hours')) {
    insights.push('Workload concern mentioned. Review project assignments and staffing.');
  }
  
  if (lowerText.includes('compensation') || lowerText.includes('pay') || lowerText.includes('salary')) {
    insights.push('Compensation mentioned. Consider salary review and market analysis.');
  }
  
  if (lowerText.includes('growth') || lowerText.includes('career') || lowerText.includes('promotion')) {
    if (result.score < 0) {
      insights.push('Career growth concern. Discuss development plan and advancement opportunities.');
    } else {
      insights.push('Positive career sentiment. Employee engaged with growth opportunities.');
    }
  }
  
  if (lowerText.includes('team') || lowerText.includes('colleague')) {
    if (result.score < 0) {
      insights.push('Team dynamics issue. May need team building or conflict resolution.');
    } else {
      insights.push('Positive team sentiment. Strong collaborative environment.');
    }
  }
  
  if (lowerText.includes('recognition') || lowerText.includes('appreciated') || lowerText.includes('valued')) {
    if (result.score < 0) {
      insights.push('Recognition gap. Employee may feel underappreciated. Increase acknowledgment.');
    }
  }
  
  // Positive reinforcements
  if (result.score > 0.5 && result.confidence > 70) {
    insights.push('Strong positive sentiment. Employee is highly engaged. Continue current approach.');
  }
  
  // Mixed signals
  const hasPositiveKeywords = result.keywords.some(k => k.sentiment === 'positive');
  const hasNegativeKeywords = result.keywords.some(k => k.sentiment === 'negative');
  
  if (hasPositiveKeywords && hasNegativeKeywords && Math.abs(result.score) < 0.2) {
    insights.push('Mixed signals detected. Deep dive conversation recommended to understand full context.');
  }
  
  // Length-based insights
  if (result.metadata && result.metadata.textLength > 100) {
    insights.push('Detailed feedback provided. Employee is engaged in communication.');
  } else if (result.metadata && result.metadata.textLength < 20 && result.score < 0) {
    insights.push('Brief negative feedback. May indicate disengagement or frustration.');
  }
  
  return insights;
}

// Compare sentiment over time
export function analyzeSentimentTrend(
  currentScore: number, 
  historicalScores: number[]
): {
  trend: 'improving' | 'stable' | 'declining' | 'volatile';
  changeRate: number;
  recommendation: string;
} {
  if (historicalScores.length === 0) {
    return {
      trend: 'stable',
      changeRate: 0,
      recommendation: 'Establish baseline. Continue monitoring over next 3 months.'
    };
  }
  
  const avgHistorical = historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length;
  const changeRate = currentScore - avgHistorical;
  
  // Calculate volatility
  const variance = historicalScores.reduce((sum, score) => {
    return sum + Math.pow(score - avgHistorical, 2);
  }, 0) / historicalScores.length;
  const isVolatile = variance > 0.15;
  
  if (isVolatile) {
    return {
      trend: 'volatile',
      changeRate,
      recommendation: 'Inconsistent sentiment patterns. Investigate environmental factors causing fluctuations.'
    };
  }
  
  if (changeRate > 0.2) {
    return {
      trend: 'improving',
      changeRate,
      recommendation: 'Sentiment improving. Document successful interventions for replication.'
    };
  }
  
  if (changeRate < -0.2) {
    return {
      trend: 'declining',
      changeRate,
      recommendation: 'Sentiment declining. Immediate manager check-in required to address concerns.'
    };
  }
  
  return {
    trend: 'stable',
    changeRate,
    recommendation: 'Sentiment stable. Maintain current engagement practices.'
  };
}

// Aggregate sentiment across multiple feedback items
export function aggregateSentiment(texts: string[]): {
  overallScore: number;
  overallLabel: 'Positive' | 'Neutral' | 'Negative';
  averageConfidence: number;
  topKeywords: { word: string; sentiment: 'positive' | 'negative' | 'neutral'; frequency: number }[];
  hasAttritionRisk: boolean;
  hasMentalHealthConcern: boolean;
  hasCriticalIssue: boolean;
} {
  if (texts.length === 0) {
    return {
      overallScore: 0,
      overallLabel: 'Neutral',
      averageConfidence: 0,
      topKeywords: [],
      hasAttritionRisk: false,
      hasMentalHealthConcern: false,
      hasCriticalIssue: false,
    };
  }
  
  const results = texts.map(text => analyzeSentiment(text));
  const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  
  // Aggregate keywords
  const keywordMap = new Map<string, { sentiment: 'positive' | 'negative' | 'neutral'; frequency: number }>();
  results.forEach(result => {
    result.keywords.forEach(kw => {
      const existing = keywordMap.get(kw.word);
      if (existing) {
        existing.frequency++;
      } else {
        keywordMap.set(kw.word, { sentiment: kw.sentiment, frequency: 1 });
      }
    });
  });
  
  const topKeywords = Array.from(keywordMap.entries())
    .map(([word, data]) => ({ word, ...data }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);
  
  const hasAttritionRisk = results.some(r => r.metadata?.attritionRisk);
  const hasMentalHealthConcern = results.some(r => r.metadata?.mentalHealthConcern);
  const hasCriticalIssue = results.some(r => r.metadata?.criticalIssue);
  
  return {
    overallScore,
    overallLabel: getSentimentLabel(overallScore),
    averageConfidence: Math.round(averageConfidence),
    topKeywords,
    hasAttritionRisk,
    hasMentalHealthConcern,
    hasCriticalIssue,
  };
}
