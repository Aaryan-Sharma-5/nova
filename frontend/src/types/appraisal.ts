export type AppraisalStatus = "draft" | "under_review" | "finalized";

export interface AppraisalScoreBreakdown {
  performance_contribution: number;
  consistency_contribution: number;
  growth_contribution: number;
  engagement_contribution: number;
  retention_risk_penalty: number;
  burnout_penalty: number;
  sentiment_bonus: number;
  feedback_signal: number;
  total: number;
}

export interface AppraisalEmployee {
  id: string;
  name: string;
  department: string;
  role: string;
  tenure_months: number;
}

export interface FeedbackEvidence {
  id: string;
  message: string;
  created_at: string;
}

export interface AppraisalSuggestion {
  id: string;
  employee_id: string;
  generated_at: string;
  composite_score: number;
  category: string;
  summary: string;
  recommendations: string[];
  salary_action: string;
  promotion_eligible: boolean;
  review_flag: string;
  hr_notes?: string | null;
  hr_decision?: string | null;
  status: AppraisalStatus;
  finalized_by?: string | null;
  finalized_at?: string | null;
  department?: string | null;
  employee_name?: string | null;
  employee_role?: string | null;
  score_breakdown?: Partial<AppraisalScoreBreakdown>;
  employee?: AppraisalEmployee;
  feedback_evidence?: FeedbackEvidence[];
}

export interface AppraisalSummary {
  total_reviewed: number;
  promotion_eligible_count: number;
  pip_count: number;
  fast_track_count: number;
  category_distribution: Record<string, number>;
  avg_composite_score: number;
  dept_breakdown: Record<string, Record<string, number>>;
  draft_count: number;
}
