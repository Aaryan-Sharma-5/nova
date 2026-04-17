import { Employee, Department, TimePoint } from '@/types/employee';
import { calculateBurnoutRisk, calculateAttritionRisk } from './riskCalculation';

const EMPLOYEE_SEEDS: Array<{ department: Department; names: string[] }> = [
  {
    department: 'Engineering',
    names: [
      'Arjun Sharma', 'Priya Patel', 'Rohan Mehta', 'Sneha Iyer', 'Vikram Nair',
      'Ananya Krishnan', 'Karan Malhotra', 'Divya Reddy', 'Rahul Gupta', 'Pooja Joshi',
      'Aditya Verma', 'Meera Pillai', 'Siddharth Rao', 'Kavya Menon', 'Nikhil Desai',
      'Riya Bose', 'Manish Kumar', 'Tanvi Shah', 'Abhishek Tiwari', 'Deepika Nambiar',
    ],
  },
  {
    department: 'Sales',
    names: [
      'Suresh Venkatesh', 'Priyanka Chatterjee', 'Amit Sinha', 'Sunita Kulkarni', 'Rajesh Pandey',
      'Nandini Bhatt', 'Gaurav Aggarwal', 'Shruti Kaur', 'Vivek Saxena', 'Pallavi Jain',
      'Harish Murthy', 'Kritika Dubey', 'Sanjay Hegde', 'Roshni Puri', 'Varun Chandra',
      'Ishaan Trivedi', 'Neha Mishra', 'Kunal Bhatia', 'Swati Ghosh', 'Mohan Lal',
    ],
  },
  {
    department: 'HR',
    names: [
      'Lakshmi Subramaniam', 'Ashish Kapoor', 'Madhu Nair', 'Ravi Shankar', 'Geeta Pillai',
      'Pranav Dixit', 'Shweta Jaiswal', 'Naresh Chaudhary', 'Anjali Menon', 'Dinesh Mahajan',
      'Usha Rani', 'Sushil Tomar', 'Rekha Bajaj', 'Arun Varghese', 'Poonam Srivastava',
      'Girish Patil', 'Seema Khanna', 'Bhavesh Parekh', 'Hema Shetty', 'Tarun Rastogi',
    ],
  },
  {
    department: 'Design',
    names: [
      'Nidhi Oberoi', 'Samir Deshpande', 'Poornima Krishnaswamy', 'Chirag Thakkar', 'Aarti Goswami',
      'Rohit Banerjee', 'Smita Naik', 'Yash Agarwal', 'Preethi Suresh', 'Akash Jha',
      'Vandana Raman', 'Saurabh Vyas', 'Lalitha Pillai', 'Mihir Gandhi', 'Falguni Shah',
    ],
  },
  {
    department: 'Finance',
    names: [
      'Ramesh Iyer', 'Sudha Krishnamurthy', 'Pavan Reddy', 'Chitra Nambiar', 'Sunil Dube',
      'Anita Sood', 'Manoj Tripathi', 'Kavitha Balakrishnan', 'Sachin Wagh', 'Jyoti Chauhan',
      'Hemant Pathak', 'Radha Gopal', 'Nitin Kulkarni', 'Shobha Hegde', 'Dilip Sawant',
      'Madhuri Apte', 'Bhaskar Rao', 'Sundar Mani', 'Karuna Devi', 'Prakash Nayak',
    ],
  },
  {
    department: 'Operations',
    names: [
      'Alpesh Modi', 'Vaishali Pawar', 'Rajendra Solanki', 'Urvashi Mehrotra', 'Ajay Thakur',
    ],
  },
];

const DEPARTMENT_CODES: Record<Department, string> = {
  Engineering: 'ENG',
  Sales: 'SAL',
  Marketing: 'MKT',
  HR: 'HRD',
  Operations: 'OPS',
  Finance: 'FIN',
  Product: 'PRD',
  Design: 'DES',
};

const DEPARTMENT_ROLES: Record<Department, string[]> = {
  Engineering: ['Software Engineer', 'Senior Engineer', 'Tech Lead', 'DevOps Engineer', 'QA Engineer'],
  Sales: ['Account Executive', 'Sales Manager', 'SDR', 'Enterprise AE', 'Sales Ops'],
  Marketing: ['Marketing Manager', 'Content Strategist', 'Growth Analyst', 'Brand Designer', 'SEO Specialist'],
  HR: ['HR Business Partner', 'Recruiter', 'People Ops Manager', 'L&D Specialist', 'HRIS Analyst'],
  Operations: ['Operations Manager', 'Business Analyst', 'Project Manager', 'Process Engineer', 'Supply Chain Analyst'],
  Finance: ['Financial Analyst', 'Controller', 'Accountant', 'FP&A Manager', 'Tax Specialist'],
  Product: ['Product Manager', 'Product Designer', 'UX Researcher', 'Data Analyst', 'Scrum Master'],
  Design: ['UI Designer', 'UX Designer', 'Design Lead', 'Visual Designer', 'Motion Designer'],
};

const DEPARTMENT_MANAGER_IDS: Record<Department, number[]> = {
  Engineering: [5, 9, 13],
  Sales: [5, 9, 13],
  Marketing: [5, 9, 13],
  HR: [5, 9, 13],
  Operations: [1],
  Finance: [5, 9, 13],
  Product: [5, 9, 13],
  Design: [5, 9],
};

function getEmployeeId(department: Department, index: number): string {
  return `NOVA-${DEPARTMENT_CODES[department]}${String(index).padStart(3, '0')}`;
}

function getEmail(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, '.')}@company.com`;
}

function getTitle(department: Department, index: number, totalInDepartment: number): string {
  if (department === 'Engineering') {
    if (index === 1) return 'Chief Executive Officer';
    if (index === totalInDepartment) return 'VP Engineering';
    if (DEPARTMENT_MANAGER_IDS.Engineering.includes(index)) return 'Engineering Manager';
  }

  if (department !== 'Engineering' && index === 1) {
    if (department === 'Sales') return 'VP Sales';
    if (department === 'HR') return 'VP HR';
    if (department === 'Design') return 'VP Design';
    if (department === 'Finance') return 'VP Finance & Ops';
    if (department === 'Operations') return 'Operations Manager';
  }

  if (DEPARTMENT_MANAGER_IDS[department].includes(index)) {
    if (department === 'Operations') return 'Operations Manager';
    return `${department} Manager`;
  }

  return DEPARTMENT_ROLES[department][(index - 1) % DEPARTMENT_ROLES[department].length];
}

function getReportsTo(department: Department, index: number, totalInDepartment: number): string {
  const rootId = getEmployeeId('Engineering', 1);
  const vpId = department === 'Engineering' ? getEmployeeId('Engineering', totalInDepartment) : getEmployeeId(department, 1);
  if (department === 'Engineering') {
    if (index === 1) return '';
    if (index === totalInDepartment) return rootId;
    if (DEPARTMENT_MANAGER_IDS.Engineering.includes(index)) return vpId;
  } else if (department === 'Operations') {
    if (index === 1) return getEmployeeId('Finance', 1);
  } else {
    if (index === 1) return rootId;
    if (DEPARTMENT_MANAGER_IDS[department].includes(index)) return vpId;
  }

  const managerIds = DEPARTMENT_MANAGER_IDS[department]
    .filter((managerIndex) => managerIndex <= totalInDepartment)
    .map((managerIndex) => getEmployeeId(department, managerIndex));

  const directReports = Array.from({ length: totalInDepartment }, (_, offset) => offset + 1)
    .filter((candidateIndex) => {
      if (department === 'Engineering') return candidateIndex !== 1 && candidateIndex !== totalInDepartment && !DEPARTMENT_MANAGER_IDS.Engineering.includes(candidateIndex);
      if (department === 'Operations') return candidateIndex !== 1;
      return candidateIndex !== 1 && !DEPARTMENT_MANAGER_IDS[department].includes(candidateIndex);
    });

  const position = directReports.indexOf(index);
  if (position >= 0 && managerIds.length > 0) {
    return managerIds[position % managerIds.length];
  }

  if (department === 'Operations') {
    return getEmployeeId('Operations', 1);
  }

  return department === 'Engineering' ? vpId : rootId;
}

const ROLES: Record<Department, string[]> = {
  Engineering: ['Software Engineer', 'Senior Engineer', 'Tech Lead', 'DevOps Engineer', 'QA Engineer'],
  Sales: ['Account Executive', 'Sales Manager', 'SDR', 'Enterprise AE', 'Sales Ops'],
  Marketing: ['Marketing Manager', 'Content Strategist', 'Growth Analyst', 'Brand Designer', 'SEO Specialist'],
  HR: ['HR Business Partner', 'Recruiter', 'People Ops Manager', 'L&D Specialist', 'HRIS Analyst'],
  Operations: ['Operations Manager', 'Business Analyst', 'Project Manager', 'Process Engineer', 'Supply Chain Analyst'],
  Finance: ['Financial Analyst', 'Controller', 'Accountant', 'FP&A Manager', 'Tax Specialist'],
  Product: ['Product Manager', 'Product Designer', 'UX Researcher', 'Data Analyst', 'Scrum Master'],
  Design: ['UI Designer', 'UX Designer', 'Design Lead', 'Visual Designer', 'Motion Designer'],
};

const POSITIVE_FEEDBACK = [
  "I feel incredibly supported by my team. The collaborative environment helps me grow every day.",
  "Great work-life balance and excellent management support. I'm motivated and engaged.",
  "The company culture is fantastic. I feel valued and appreciated for my contributions.",
  "Love the new mentorship program. It's helping me develop skills I've always wanted.",
  "My manager is great at providing feedback. I feel I'm on a strong growth trajectory.",
  "The team is amazing. We celebrate wins together and support each other through challenges.",
  "I'm excited about our product roadmap. It feels like we're building something meaningful.",
  "Flexible work policy has been a game-changer for my productivity and happiness.",
];

const NEUTRAL_FEEDBACK = [
  "Work is going okay. Some days are better than others, but overall it's fine.",
  "The new process changes are taking some getting used to, but I understand why they're needed.",
  "Team dynamics are decent. Could use more cross-functional collaboration.",
  "Workload is manageable most weeks. Occasionally it spikes but that's expected.",
  "The role is meeting my expectations so far. Nothing particularly exciting or concerning.",
];

const NEGATIVE_FEEDBACK = [
  "I'm feeling overwhelmed with the workload. Multiple deadlines are causing significant stress.",
  "Frustrated with the lack of career growth opportunities. Feeling stagnant in my role.",
  "The constant pressure and overtime is leading to burnout. I dread coming to work.",
  "Management doesn't listen to our concerns. I feel undervalued and ignored.",
  "Toxic team dynamics and micromanagement are making me consider leaving.",
  "Exhausted from back-to-back projects. No time for learning or personal development.",
  "I'm stressed about the reorganization. Job security concerns are affecting my performance.",
  "Unhappy with compensation. Market rates are much higher for my role and experience.",
];

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function seedFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function generateTimeHistory(months: number, baseScore: number, variance: number, trend: number): TimePoint[] {
  const points: TimePoint[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const noise = (Math.random() - 0.5) * variance;
    const trendEffect = ((months - i) / months) * trend;
    const score = Math.max(-1, Math.min(100, baseScore + noise + trendEffect));
    points.push({ date: d.toISOString().split('T')[0], score: Math.round(score * 100) / 100 });
  }
  return points;
}

function generateFeedback(sentimentScore: number): string[] {
  const feedback: string[] = [];
  const count = randInt(2, 4);
  for (let i = 0; i < count; i++) {
    if (sentimentScore > 0.3) feedback.push(pick(POSITIVE_FEEDBACK));
    else if (sentimentScore < -0.3) feedback.push(pick(NEGATIVE_FEEDBACK));
    else feedback.push(pick(NEUTRAL_FEEDBACK));
  }
  return [...new Set(feedback)]; // dedupe
}

export function generateEmployees(count: number = 100): Employee[] {
  const employees: Employee[] = [];
  const onboardingSlots = [
    { index: 0, department: 'Engineering', flags: ['Integration Risk'] },
    { index: 1, department: 'Engineering', flags: ['Ramp Risk'] },
    { index: 2, department: 'Sales', flags: ['Isolation Risk'] },
    { index: 3, department: 'Sales', flags: ['Integration Risk'] },
    { index: 4, department: 'HR', flags: ['Ramp Risk'] },
    { index: 5, department: 'HR', flags: ['Isolation Risk'] },
    { index: 6, department: 'Design', flags: ['Integration Risk'] },
    { index: 7, department: 'Finance', flags: ['Integration Risk', 'Ramp Risk', 'Isolation Risk'] },
  ] as const;
  const onboardingMap = new Map<number, { department: Department; flags: string[] }>(
    onboardingSlots.map((slot) => [slot.index, { department: slot.department as Department, flags: [...slot.flags] }]),
  );
  let sequenceIndex = 0;

  for (const seedGroup of EMPLOYEE_SEEDS) {
    const { department, names } = seedGroup;
    const totalInDepartment = names.length;

    for (let deptIndex = 1; deptIndex <= names.length; deptIndex += 1) {
      if (sequenceIndex >= count) break;

      const name = names[deptIndex - 1];
      const employeeId = getEmployeeId(department, deptIndex);
      const forcedOnboarding = onboardingMap.get(sequenceIndex);
      const role = pick(ROLES[department]);
      const title = getTitle(department, deptIndex, totalInDepartment);
      const reportsTo = getReportsTo(department, deptIndex, totalInDepartment);
      const tenure = forcedOnboarding ? randInt(1, 2) : randInt(4, 72);

      // Create correlated scores
      const baseWellbeing = Math.random(); // 0=poor, 1=great
      const performanceScore = Math.round(rand(50, 100) * (0.5 + baseWellbeing * 0.5));
      const engagementScore = Math.round(rand(30, 100) * (0.3 + baseWellbeing * 0.7));
      const sentimentBucket = sequenceIndex % 20;
      let sentimentScore = 0;
      if (sentimentBucket < 8) {
        sentimentScore = rand(0.3, 0.8);
      } else if (sentimentBucket < 15) {
        sentimentScore = rand(-0.3, 0.3);
      } else {
        sentimentScore = rand(-1.0, -0.3);
      }
      sentimentScore = Math.round(sentimentScore * 100) / 100;
      const clampedSentiment = Math.max(-1, Math.min(1, sentimentScore));

      const workHoursPerWeek = Math.round(rand(35, 55));
      const projectLoad = randInt(1, 6);
      const absenceDays = baseWellbeing < 0.3 ? randInt(5, 15) : randInt(0, 6);

      const perfTrend = baseWellbeing < 0.3 ? rand(-15, -5) : rand(-3, 10);
      const performanceHistory = generateTimeHistory(12, performanceScore, 8, perfTrend);
      const sentimentHistory = generateTimeHistory(12, clampedSentiment * 50 + 50, 10, baseWellbeing < 0.3 ? -10 : 5).map((point) => ({
        ...point,
        score: Math.round((point.score / 50 - 1) * 100) / 100,
      }));

      const perfDecline = perfTrend < -5 ? Math.abs(perfTrend) / 20 : 0;
      const absenceRate = absenceDays / 15;
      const perfStagnation = Math.abs(perfTrend) < 3 ? 0.5 : perfTrend < -5 ? 0.8 : 0.1;

      const burnoutRisk = calculateBurnoutRisk(workHoursPerWeek, clampedSentiment, perfDecline, absenceRate);
      const attritionRisk = calculateAttritionRisk(clampedSentiment, engagementScore, tenure, perfStagnation);

      const lastAssessmentDate = new Date();
      lastAssessmentDate.setDate(lastAssessmentDate.getDate() - randInt(1, 45));

      const seeded = seededRandom(seedFromId(employeeId));
      const attendanceRate = Number((0.75 + seeded() * 0.25).toFixed(2));
      const avgWeeklyHours = Number((38 + seeded() * 20).toFixed(1));
      const leavesTaken30d = Math.floor(seeded() * 6);
      const kpiScore = Number((0.4 + seeded() * 0.6).toFixed(2));
      const lastOneOnOneDaysAgo = 3 + Math.floor(seeded() * 43);
      const feedbackSubmissionsCount = Math.floor(seeded() * 9);
      const afterHoursSessionsWeekly = Math.floor(seeded() * 7);
      const tenureDays = forcedOnboarding
        ? 7 + Math.floor(seeded() * 79)
        : 90 + Math.floor(seeded() * 1711);
      const peerConnectionCount = 1 + Math.floor(seeded() * 8);

      const onboardingFlags = forcedOnboarding ? forcedOnboarding.flags : [];
      const adjustedPeerConnections = onboardingFlags.includes('Integration Risk') ? Math.min(peerConnectionCount, 2) : peerConnectionCount;
      const adjustedKpi = onboardingFlags.includes('Ramp Risk') ? Math.min(kpiScore, 0.49) : kpiScore;
      const adjustedOneOnOne = onboardingFlags.includes('Isolation Risk') ? Math.max(lastOneOnOneDaysAgo, 21) : lastOneOnOneDaysAgo;

      const qualityFields = [
        attendanceRate,
        avgWeeklyHours,
        leavesTaken30d,
        adjustedKpi,
        adjustedOneOnOne,
        feedbackSubmissionsCount,
        afterHoursSessionsWeekly,
        tenureDays,
      ];
      const nonNullCount = qualityFields.filter((value) => value !== null && value !== undefined).length;
      const dataQualityScore = Math.round((nonNullCount / qualityFields.length) * 100);

      employees.push({
        id: employeeId,
        name,
        email: getEmail(name),
        department,
        role,
        title,
        reportsTo,
        orgLevel:
          department === 'Engineering' && deptIndex === 1
            ? 1
            : department === 'Operations' && deptIndex === 1
              ? 3
            : ((department === 'Engineering' && deptIndex === totalInDepartment) || (department !== 'Engineering' && deptIndex === 1))
              ? 2
              : (DEPARTMENT_MANAGER_IDS[department].includes(deptIndex) || (department === 'Operations' && deptIndex === 1))
                ? 3
                : 4,
        tenure,
        performanceScore: Math.max(0, Math.min(100, performanceScore)),
        engagementScore: Math.max(0, Math.min(100, engagementScore)),
        sentimentScore: clampedSentiment,
        burnoutRisk,
        attritionRisk,
        workHoursPerWeek,
        projectLoad,
        absenceDays,
        lastAssessment: lastAssessmentDate.toISOString().split('T')[0],
        recentFeedback: generateFeedback(clampedSentiment),
        performanceHistory,
        sentimentHistory,
        isOnboarding: tenureDays < 90,
        onboardingDay: Math.min(89, tenureDays),
        onboardingFlags,
        attendanceRate,
        avgWeeklyHours,
        leavesTaken30d,
        kpiScore: adjustedKpi,
        lastOneOnOneDaysAgo: adjustedOneOnOne,
        feedbackSubmissionsCount,
        afterHoursSessionsWeekly,
        tenureDays,
        peerConnectionCount: adjustedPeerConnections,
        dataQualityScore,
      });

      const current = employees[employees.length - 1];
      if (current.id === 'NOVA-ENG005') {
        current.burnoutRisk = 82;
        current.attritionRisk = 78;
        current.sentimentScore = -0.9;
        current.tenure = Math.max(current.tenure, 45);
        current.tenureDays = 45 * 30;
        current.isOnboarding = false;
        current.onboardingDay = undefined;
        current.onboardingFlags = [];
        current.lastOneOnOneDaysAgo = 45;
        current.afterHoursSessionsWeekly = 6;
        current.feedbackSubmissionsCount = 0;
        current.kpiScore = Math.min(current.kpiScore, 0.44);
        current.recentFeedback = [
          'I am overwhelmed and unable to recover between sprints.',
          'The ticket load has become unsustainable and support is limited.',
        ];
      }
      if (current.id === 'NOVA-ENG002') {
        current.performanceScore = 91;
        current.engagementScore = 94;
        current.burnoutRisk = 12;
        current.attritionRisk = 9;
        current.sentimentScore = 0.8;
        current.kpiScore = 0.93;
        current.recentFeedback = [
          'I feel energized and highly supported by my team.',
          'Excited to keep growing and taking ownership on complex work.',
        ];
      }
      if (current.id === 'NOVA-DES005') {
        current.burnoutRisk = 55;
        current.attritionRisk = Math.max(current.attritionRisk, 56);
        current.sentimentScore = -0.4;
        current.afterHoursSessionsWeekly = Math.max(current.afterHoursSessionsWeekly, 6);
        current.feedbackSubmissionsCount = 0;
        current.recentFeedback = [
          'I have been quieter recently and feel disconnected from team decisions.',
          'Work has become heavier after hours and I am struggling to reset.',
        ];
      }

      sequenceIndex += 1;
    }
  }

  return employees;
}
