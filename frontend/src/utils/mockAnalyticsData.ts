// Mock data generators for advanced HR analytics

export interface AttritionForecast {
  month: string;
  engineering: number;
  sales: number;
  marketing: number;
  operations: number;
  engineeringLower: number;
  engineeringUpper: number;
  salesLower: number;
  salesUpper: number;
  marketingLower: number;
  marketingUpper: number;
  operationsLower: number;
  operationsUpper: number;
}

export interface TenureBucket {
  range: string;
  count: number;
  attritionRisk: number;
  industryBenchmark: number;
}

export interface QuadrantEmployee {
  id: string;
  name: string;
  engagement: number;
  performance: number;
  quadrant: 'stars' | 'engaged-underperformers' | 'disengaged-high-performers' | 'at-risk';
  department: string;
  role: string;
}

export interface BurnoutHeatmapData {
  department: string;
  weeks: number[];
}

export interface SkillsData {
  skill: string;
  current: number;
  required: number;
}

export interface CompensationData {
  department: string;
  role: string;
  salaries: number[];
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  gender?: 'male' | 'female' | 'other';
}

export interface HiringFunnelStage {
  stage: string;
  count: number;
  conversionRate: number;
}

export interface AbsenteeismData {
  month: string;
  sickLeave: number;
  personalLeave: number;
  unplanned: number;
  burnoutScore: number;
}

export interface ManagerScore {
  managerId: string;
  managerName: string;
  teamSize: number;
  avgPerformance: number;
  avgSentiment: number;
  turnoverRate: number;
  enpsScore: number;
  trend: number[];
  directReports?: string[];
}

export interface FlightRiskEvent {
  date: string;
  type: 'review' | 'one-on-one' | 'milestone' | 'sentiment-shift';
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface FlightRiskData {
  employeeId: string;
  riskScores: { date: string; score: number }[];
  events: FlightRiskEvent[];
  recommendations: string[];
}

export interface NetworkNode {
  id: string;
  name: string;
  influence: number;
  sentiment: number;
  department: string;
}

export interface NetworkLink {
  source: string;
  target: string;
  strength: number;
}

export interface SentimentEmotions {
  joy: number;
  trust: number;
  fear: number;
  surprise: number;
  sadness: number;
  disgust: number;
  anger: number;
  anticipation: number;
}

export interface SentimentTopic {
  topic: string;
  count: number;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface WordCloudItem {
  text: string;
  value: number;
  sentiment: 'positive' | 'negative' | 'neutral';
}

// Generate attrition forecast data
export const generateAttritionForecast = (): AttritionForecast[] => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  return months.map((month, i) => ({
    month,
    engineering: 8 + Math.random() * 4 + i * 0.5,
    sales: 12 + Math.random() * 5 + i * 0.3,
    marketing: 10 + Math.random() * 3 + i * 0.4,
    operations: 7 + Math.random() * 3 + i * 0.2,
    engineeringLower: 6 + i * 0.5,
    engineeringUpper: 10 + Math.random() * 4 + i * 0.5,
    salesLower: 10 + i * 0.3,
    salesUpper: 15 + Math.random() * 5 + i * 0.3,
    marketingLower: 8 + i * 0.4,
    marketingUpper: 12 + Math.random() * 3 + i * 0.4,
    operationsLower: 5 + i * 0.2,
    operationsUpper: 9 + Math.random() * 3 + i * 0.2,
  }));
};

// Generate tenure distribution data
export const generateTenureDistribution = (): TenureBucket[] => {
  return [
    { range: '0-6mo', count: 45, attritionRisk: 35, industryBenchmark: 40 },
    { range: '6-12mo', count: 38, attritionRisk: 42, industryBenchmark: 35 },
    { range: '1-2yr', count: 52, attritionRisk: 28, industryBenchmark: 50 },
    { range: '2-5yr', count: 78, attritionRisk: 15, industryBenchmark: 75 },
    { range: '5yr+', count: 34, attritionRisk: 8, industryBenchmark: 30 },
  ];
};

// Generate quadrant employee data
export const generateQuadrantEmployees = (): QuadrantEmployee[] => {
  const names = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Lee', 'Emma Wilson', 
    'Frank Brown', 'Grace Taylor', 'Henry Miller', 'Iris Chen', 'Jack Anderson',
    'Kate Martinez', 'Leo Garcia', 'Maya Patel', 'Noah Kim', 'Olivia White',
    'Paul Jones', 'Quinn Roberts', 'Rachel Green', 'Sam Cooper', 'Tina Lopez'];
  
  const departments = ['Engineering', 'Sales', 'Marketing', 'Operations'];
  const roles = ['Senior', 'Mid-Level', 'Junior', 'Lead', 'Manager'];
  
  return names.map((name, i) => {
    const engagement = Math.random() * 100;
    const performance = Math.random() * 100;
    let quadrant: QuadrantEmployee['quadrant'];
    
    if (engagement >= 50 && performance >= 50) quadrant = 'stars';
    else if (engagement >= 50 && performance < 50) quadrant = 'engaged-underperformers';
    else if (engagement < 50 && performance >= 50) quadrant = 'disengaged-high-performers';
    else quadrant = 'at-risk';
    
    return {
      id: `emp-${i}`,
      name,
      engagement,
      performance,
      quadrant,
      department: departments[i % departments.length],
      role: roles[i % roles.length],
    };
  });
};

// Generate burnout heatmap data
export const generateBurnoutHeatmap = (): BurnoutHeatmapData[] => {
  const departments = ['Engineering', 'Sales', 'Marketing', 'Operations', 'HR', 'Finance'];
  return departments.map(dept => ({
    department: dept,
    weeks: Array.from({ length: 12 }, () => Math.floor(Math.random() * 100)),
  }));
};

// Generate skills gap data
export const generateSkillsData = (department?: string): SkillsData[] => {
  const baseSkills = [
    { skill: 'Leadership', current: 65, required: 80 },
    { skill: 'Technical', current: 72, required: 85 },
    { skill: 'Communication', current: 68, required: 75 },
    { skill: 'Adaptability', current: 70, required: 78 },
    { skill: 'Collaboration', current: 75, required: 80 },
    { skill: 'Execution', current: 78, required: 85 },
  ];
  
  // Vary slightly by department
  if (department === 'Engineering') {
    return baseSkills.map(s => 
      s.skill === 'Technical' ? { ...s, current: 85, required: 90 } : s
    );
  }
  
  return baseSkills;
};

// Generate compensation data
export const generateCompensationData = (): CompensationData[] => {
  const departments = ['Engineering', 'Sales', 'Marketing', 'Operations'];
  const roles = ['Junior', 'Mid-Level', 'Senior', 'Lead'];
  const data: CompensationData[] = [];
  
  departments.forEach(dept => {
    roles.forEach(role => {
      const baseSalary = role === 'Junior' ? 60000 : 
                        role === 'Mid-Level' ? 85000 :
                        role === 'Senior' ? 120000 : 150000;
      
      const deptMultiplier = dept === 'Engineering' ? 1.2 : 
                            dept === 'Sales' ? 1.1 : 1.0;
      
      const salaries = Array.from({ length: 15 }, () => 
        baseSalary * deptMultiplier * (0.85 + Math.random() * 0.3)
      );
      
      salaries.sort((a, b) => a - b);
      const q1 = salaries[Math.floor(salaries.length * 0.25)];
      const median = salaries[Math.floor(salaries.length * 0.5)];
      const q3 = salaries[Math.floor(salaries.length * 0.75)];
      
      data.push({
        department: dept,
        role,
        salaries,
        median,
        q1,
        q3,
        min: salaries[0],
        max: salaries[salaries.length - 1],
      });
    });
  });
  
  return data;
};

// Generate hiring funnel data
export const generateHiringFunnelData = (): { current: HiringFunnelStage[]; previous: HiringFunnelStage[] } => {
  return {
    current: [
      { stage: 'Applied', count: 500, conversionRate: 100 },
      { stage: 'Screened', count: 150, conversionRate: 30 },
      { stage: 'Interviewed', count: 75, conversionRate: 50 },
      { stage: 'Offered', count: 25, conversionRate: 33 },
      { stage: 'Accepted', count: 20, conversionRate: 80 },
    ],
    previous: [
      { stage: 'Applied', count: 480, conversionRate: 100 },
      { stage: 'Screened', count: 140, conversionRate: 29 },
      { stage: 'Interviewed', count: 65, conversionRate: 46 },
      { stage: 'Offered', count: 22, conversionRate: 34 },
      { stage: 'Accepted', count: 17, conversionRate: 77 },
    ],
  };
};

// Generate absenteeism data
export const generateAbsenteeismData = (): AbsenteeismData[] => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map(month => ({
    month,
    sickLeave: 2 + Math.random() * 3,
    personalLeave: 1 + Math.random() * 2,
    unplanned: 0.5 + Math.random() * 2,
    burnoutScore: 40 + Math.random() * 40,
  }));
};

// Generate manager effectiveness data
export const generateManagerScores = (): ManagerScore[] => {
  const managers = [
    'Sarah Chen', 'Michael Park', 'Jennifer Lopez', 'David Kim',
    'Amanda White', 'Chris Johnson', 'Lisa Martinez', 'Robert Taylor'
  ];
  
  return managers.map((name, i) => ({
    managerId: `mgr-${i}`,
    managerName: name,
    teamSize: 5 + Math.floor(Math.random() * 10),
    avgPerformance: 60 + Math.random() * 35,
    avgSentiment: 50 + Math.random() * 45,
    turnoverRate: 5 + Math.random() * 20,
    enpsScore: -10 + Math.random() * 70,
    trend: Array.from({ length: 30 }, () => 50 + Math.random() * 40),
    directReports: Array.from({ length: 5 + Math.floor(Math.random() * 5) }, 
      (_, j) => `Employee ${i * 5 + j + 1}`
    ),
  }));
};

// Generate flight risk timeline data
export const generateFlightRiskData = (employeeId: string): FlightRiskData => {
  const today = new Date();
  const riskScores = Array.from({ length: 90 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (89 - i));
    return {
      date: date.toISOString().split('T')[0],
      score: 30 + Math.random() * 40 + Math.sin(i / 10) * 15,
    };
  });
  
  const events: FlightRiskEvent[] = [
    {
      date: riskScores[20].date,
      type: 'review',
      description: 'Annual performance review completed',
      impact: 'positive',
    },
    {
      date: riskScores[45].date,
      type: 'one-on-one',
      description: 'Last 1:1 with manager',
      impact: 'neutral',
    },
    {
      date: riskScores[60].date,
      type: 'milestone',
      description: '2-year tenure milestone reached',
      impact: 'positive',
    },
    {
      date: riskScores[75].date,
      type: 'sentiment-shift',
      description: 'Sentiment dropped significantly',
      impact: 'negative',
    },
  ];
  
  const recommendations = [
    'Schedule 1:1 within next 7 days',
    'Salary review due - benchmark shows 15% below market',
    'Recognition opportunity: 6 months since last praise',
    'Career growth discussion needed',
  ];
  
  return { employeeId, riskScores, events, recommendations };
};

// Generate network graph data
export const generateNetworkData = (
  employees?: Array<{ name: string; department: string }>,
): { nodes: NetworkNode[]; links: NetworkLink[] } => {
  const names = employees?.length
    ? employees.map((employee) => employee.name)
    : ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace',
      'Henry', 'Iris', 'Jack', 'Kate', 'Leo', 'Maya', 'Noah', 'Olivia'];
  const departments = employees?.length
    ? employees.map((employee) => employee.department)
    : ['Engineering', 'Sales', 'Marketing', 'Operations'];
  
  const nodes: NetworkNode[] = names.map((name, i) => ({
    id: `node-${i}`,
    name,
    influence: 30 + Math.random() * 70,
    sentiment: 40 + Math.random() * 50,
    department: departments[i % departments.length],
  }));
  
  const links: NetworkLink[] = [];
  nodes.forEach((node, i) => {
    const numConnections = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < numConnections; j++) {
      const targetIndex = Math.floor(Math.random() * nodes.length);
      if (targetIndex !== i) {
        links.push({
          source: node.id,
          target: nodes[targetIndex].id,
          strength: Math.random(),
        });
      }
    }
  });
  
  return { nodes, links };
};

// Generate sentiment emotions data
export const generateSentimentEmotions = (): SentimentEmotions => {
  return {
    joy: 25 + Math.random() * 30,
    trust: 20 + Math.random() * 25,
    fear: 10 + Math.random() * 15,
    surprise: 15 + Math.random() * 20,
    sadness: 8 + Math.random() * 12,
    disgust: 5 + Math.random() * 10,
    anger: 7 + Math.random() * 13,
    anticipation: 18 + Math.random() * 22,
  };
};

// Generate sentiment topics
export const generateSentimentTopics = (): SentimentTopic[] => {
  return [
    { topic: 'workload', count: 45, sentiment: 'negative' },
    { topic: 'management', count: 38, sentiment: 'neutral' },
    { topic: 'compensation', count: 52, sentiment: 'negative' },
    { topic: 'career growth', count: 67, sentiment: 'positive' },
    { topic: 'work-life balance', count: 41, sentiment: 'negative' },
    { topic: 'team collaboration', count: 58, sentiment: 'positive' },
    { topic: 'recognition', count: 29, sentiment: 'neutral' },
  ];
};

// Generate word cloud data
export const generateWordCloudData = (): WordCloudItem[] => {
  return [
    { text: 'overwhelmed', value: 85, sentiment: 'negative' },
    { text: 'growth', value: 78, sentiment: 'positive' },
    { text: 'stressed', value: 72, sentiment: 'negative' },
    { text: 'collaborative', value: 68, sentiment: 'positive' },
    { text: 'underpaid', value: 65, sentiment: 'negative' },
    { text: 'innovative', value: 62, sentiment: 'positive' },
    { text: 'burnout', value: 58, sentiment: 'negative' },
    { text: 'supportive', value: 55, sentiment: 'positive' },
    { text: 'unclear', value: 52, sentiment: 'negative' },
    { text: 'appreciated', value: 48, sentiment: 'positive' },
    { text: 'micromanaged', value: 45, sentiment: 'negative' },
    { text: 'opportunities', value: 42, sentiment: 'positive' },
    { text: 'pressure', value: 40, sentiment: 'negative' },
    { text: 'flexible', value: 38, sentiment: 'positive' },
    { text: 'disconnected', value: 35, sentiment: 'negative' },
    { text: 'inspiring', value: 32, sentiment: 'positive' },
    { text: 'meetings', value: 30, sentiment: 'neutral' },
    { text: 'learning', value: 28, sentiment: 'positive' },
    { text: 'bureaucracy', value: 25, sentiment: 'negative' },
    { text: 'autonomy', value: 22, sentiment: 'positive' },
  ];
};

// Calculate workforce health score
export const calculateWorkforceHealthScore = (): { 
  score: number; 
  delta: number; 
  components: { burnout: number; attrition: number; engagement: number; sentiment: number };
} => {
  const burnout = 75 + Math.random() * 15; // Lower burnout is better
  const attrition = 82 + Math.random() * 10; // Lower attrition risk is better
  const engagement = 68 + Math.random() * 20;
  const sentiment = 72 + Math.random() * 15;
  
  const score = (burnout + attrition + engagement + sentiment) / 4;
  const delta = -2 + Math.random() * 6; // Week-over-week change
  
  return { score, delta, components: { burnout, attrition, engagement, sentiment } };
};
