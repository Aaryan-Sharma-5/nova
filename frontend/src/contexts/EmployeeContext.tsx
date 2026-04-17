import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Employee } from '@/types/employee';
import { generateEmployees } from '@/utils/dataGenerator';
import { protectedGetApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface EmployeeContextValue {
  employees: Employee[];
  refreshData: () => void;
  getEmployee: (id: string) => Employee | undefined;
}

type BackendEmployeeRow = {
  employee_id: string;
  name: string;
  department: string;
  role?: string;
  title?: string;
  reports_to?: string | null;
  org_level?: 1 | 2 | 3 | 4;
  tenure_days?: number;
  kpi_score?: number;
  engagement_score?: number;
  sentiment_score?: number;
  burnout_risk?: number;
  attrition_risk?: number;
  avg_weekly_hours?: number;
  project_load?: number;
  absence_days?: number;
  leaves_taken_30d?: number;
  attendance_rate?: number;
  last_1on1_days_ago?: number;
  feedback_submissions_count?: number;
  after_hours_sessions_weekly?: number;
  data_quality_score?: number;
};

type OnboardingRow = {
  employee_id: string;
  onboarding_day?: number;
  risk_flags?: string[];
  peer_network_connections?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function makeTrend(seed: string, points: number, base: number, variance: number, min: number, max: number) {
  const now = new Date();
  const trend = Array.from({ length: points }, (_, index) => {
    const pointDate = new Date(now);
    pointDate.setMonth(now.getMonth() - (points - index - 1));
    const noise = (seededUnit(`${seed}:${index}`) - 0.5) * variance;
    const score = clamp(base + noise, min, max);
    return {
      date: pointDate.toISOString().slice(0, 10),
      score: Number(score.toFixed(2)),
    };
  });
  return trend;
}

function emailFromName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.')}@nova.local`;
}

function toFrontendEmployee(row: BackendEmployeeRow, onboarding?: OnboardingRow): Employee {
  const tenureDays = Math.max(1, Number(row.tenure_days || 0));
  const tenureMonths = Math.max(1, Math.round(tenureDays / 30));
  const perf = clamp(Math.round((row.kpi_score ?? 0.6) * 100), 0, 100);
  const engagement = clamp(Math.round((row.engagement_score ?? 0.65) * 100), 0, 100);
  const sentiment = clamp(Number(row.sentiment_score ?? 0), -1, 1);
  const burnout = clamp(Math.round((row.burnout_risk ?? 0.35) * 100), 0, 100);
  const attrition = clamp(Math.round((row.attrition_risk ?? 0.3) * 100), 0, 100);

  return {
    id: row.employee_id,
    name: row.name,
    email: emailFromName(row.name),
    department: row.department as Employee['department'],
    role: row.role || row.title || 'Employee',
    title: row.title,
    reportsTo: row.reports_to,
    orgLevel: row.org_level,
    tenure: tenureMonths,
    performanceScore: perf,
    engagementScore: engagement,
    sentimentScore: sentiment,
    burnoutRisk: burnout,
    attritionRisk: attrition,
    workHoursPerWeek: Number(row.avg_weekly_hours || 40),
    projectLoad: Number(row.project_load || 3),
    absenceDays: Number(row.absence_days ?? row.leaves_taken_30d ?? 0),
    lastAssessment: new Date().toISOString().slice(0, 10),
    recentFeedback: [],
    performanceHistory: makeTrend(row.employee_id, 12, perf, 14, 0, 100),
    sentimentHistory: makeTrend(`${row.employee_id}:sentiment`, 12, sentiment, 0.45, -1, 1),
    isOnboarding: Boolean(onboarding) || tenureDays < 90,
    onboardingDay: onboarding?.onboarding_day,
    onboardingFlags: onboarding?.risk_flags,
    attendanceRate: row.attendance_rate,
    avgWeeklyHours: row.avg_weekly_hours,
    leavesTaken30d: row.leaves_taken_30d,
    kpiScore: row.kpi_score,
    lastOneOnOneDaysAgo: row.last_1on1_days_ago,
    feedbackSubmissionsCount: row.feedback_submissions_count,
    afterHoursSessionsWeekly: row.after_hours_sessions_weekly,
    tenureDays,
    peerConnectionCount: onboarding?.peer_network_connections,
    dataQualityScore: row.data_quality_score,
  };
}

const EmployeeContext = createContext<EmployeeContextValue | null>(null);

export function EmployeeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>(() => generateEmployees(100));

  const loadEmployees = useCallback(async () => {
    if (!token) {
      setEmployees(generateEmployees(100));
      return;
    }

    try {
      const [employeesPayload, onboardingPayload] = await Promise.all([
        protectedGetApi<{ employees: BackendEmployeeRow[] }>("/api/employees", token),
        protectedGetApi<{ employees: OnboardingRow[] }>("/api/employees/onboarding", token).catch(() => ({ employees: [] })),
      ]);

      const onboardingById = new Map(
        (onboardingPayload.employees || []).map((row) => [row.employee_id, row]),
      );

      const mapped = (employeesPayload.employees || []).map((row) =>
        toFrontendEmployee(row, onboardingById.get(row.employee_id)),
      );
      setEmployees(mapped);
    } catch {
      setEmployees(generateEmployees(100));
    }
  }, [token]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const refreshData = useCallback(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const getEmployee = useCallback((id: string) => {
    return employees.find(e => e.id === id);
  }, [employees]);

  return (
    <EmployeeContext.Provider value={{ employees, refreshData, getEmployee }}>
      {children}
    </EmployeeContext.Provider>
  );
}

export function useEmployees() {
  const ctx = useContext(EmployeeContext);
  if (!ctx) throw new Error('useEmployees must be used within EmployeeProvider');
  return ctx;
}
