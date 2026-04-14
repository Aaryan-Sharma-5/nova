import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DollarSign,
  GraduationCap,
  Lightbulb,
  TrendingUp,
  ClipboardList,
} from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { protectedPatchApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AppraisalSuggestion, AppraisalStatus } from "@/types/appraisal";

interface AppraisalReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestion: AppraisalSuggestion | null;
  onUpdated: (suggestion: AppraisalSuggestion) => void;
}

const breakdownLabelMap: Record<string, string> = {
  performance_contribution: "Performance contribution",
  consistency_contribution: "Consistency contribution",
  growth_contribution: "Growth trajectory",
  engagement_contribution: "Engagement factor",
  retention_risk_penalty: "Retention risk penalty",
  burnout_penalty: "Burnout penalty",
  sentiment_bonus: "Sentiment bonus",
  feedback_signal: "Feedback signal",
};

function categoryBadgeClass(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.startsWith("exceptional")) return "bg-yellow-100 text-yellow-900";
  if (normalized.startsWith("high performer")) return "bg-emerald-100 text-emerald-900";
  if (normalized.startsWith("meets expectations")) return "bg-sky-100 text-sky-900";
  if (normalized.startsWith("needs improvement")) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-900";
}

function riskGaugeStyle(score: number): React.CSSProperties {
  const safe = Math.max(0, Math.min(100, score));
  return {
    background: `conic-gradient(#FFE500 ${safe * 3.6}deg, #e5e7eb 0deg)`,
  };
}

function recommendationIcon(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("salary") || normalized.includes("increment") || normalized.includes("raise")) {
    return <DollarSign className="h-4 w-4" />;
  }
  if (normalized.includes("promotion") || normalized.includes("fast track")) {
    return <TrendingUp className="h-4 w-4" />;
  }
  if (normalized.includes("training") || normalized.includes("mentorship") || normalized.includes("coach")) {
    return <GraduationCap className="h-4 w-4" />;
  }
  if (normalized.includes("pip")) {
    return <ClipboardList className="h-4 w-4" />;
  }
  return <Lightbulb className="h-4 w-4" />;
}

function humanizeSalaryAction(action: string): string {
  if (action.startsWith("increment_")) {
    const suffix = action.replace("increment_", "");
    return `↑ ${suffix.replace("%", "")} increment`;
  }
  if (action === "no_change") return "No change";
  return "Under review";
}

export function AppraisalReviewDrawer({
  open,
  onOpenChange,
  suggestion,
  onUpdated,
}: AppraisalReviewDrawerProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [hrNotes, setHrNotes] = useState("");
  const [hrDecision, setHrDecision] = useState("");
  const [status, setStatus] = useState<AppraisalStatus>("draft");

  const breakdownData = useMemo(() => {
    if (!suggestion?.score_breakdown) return [];
    const rows = Object.entries(suggestion.score_breakdown)
      .filter(([key]) => key !== "total")
      .map(([key, value]) => ({
        label: breakdownLabelMap[key] || key,
        value: Number(value || 0),
      }));
    return rows;
  }, [suggestion]);

  useEffect(() => {
    setHrNotes(suggestion?.hr_notes || "");
    setHrDecision(suggestion?.hr_decision || "");
    setStatus((suggestion?.status || "draft") as AppraisalStatus);
  }, [suggestion]);

  const handleSave = async (nextStatus?: AppraisalStatus) => {
    if (!token || !suggestion) return;
    setSaving(true);
    try {
      const payload = {
        hr_notes: hrNotes,
        hr_decision: hrDecision,
        status: nextStatus || status,
      };
      const updated = await protectedPatchApi<AppraisalSuggestion>(
        `/api/appraisals/suggestions/${suggestion.id}`,
        token,
        payload,
      );
      onUpdated(updated);
      setStatus((updated.status || status) as AppraisalStatus);
      toast({ title: "Appraisal updated" });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Could not update appraisal",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const score = Number(suggestion?.composite_score || 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-2xl">
        {!suggestion ? null : (
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle>Appraisal Review</SheetTitle>
            </SheetHeader>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold">{suggestion.employee?.name || suggestion.employee_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(suggestion.employee?.role || suggestion.employee_role) || "Unknown role"} · {(suggestion.employee?.department || suggestion.department) || "Unknown dept"}
                    </p>
                    <p className="text-sm text-muted-foreground">Tenure: {suggestion.employee?.tenure_months ?? 0} months</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-16 w-16 rounded-full" style={riskGaugeStyle(score)}>
                      <div className="absolute inset-[6px] flex items-center justify-center rounded-full bg-background text-sm font-bold">
                        {Math.round(score)}
                      </div>
                    </div>
                    <Badge className={categoryBadgeClass(suggestion.category)}>{suggestion.category}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdownData} layout="vertical" margin={{ left: 24, right: 10 }}>
                      <XAxis type="number" />
                      <YAxis dataKey="label" type="category" width={160} />
                      <Tooltip formatter={(value: number) => `${value.toFixed(2)} pts`} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {breakdownData.map((row) => (
                          <Cell key={row.label} fill={row.value >= 0 ? "#16a34a" : "#dc2626"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Total = {Number(suggestion.score_breakdown?.total || score).toFixed(2)} pts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <blockquote className="rounded border-l-4 border-primary bg-muted/40 p-3 text-sm leading-relaxed">
                  {suggestion.summary}
                </blockquote>
                <p className="mt-2 text-xs text-muted-foreground">AI-generated — review before finalizing</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(suggestion.recommendations || []).slice(0, 3).map((rec) => (
                  <div key={rec} className="flex items-start gap-2 rounded border p-3 text-sm">
                    <span className="mt-0.5">{recommendationIcon(rec)}</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feedback Evidence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(suggestion.feedback_evidence || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No linked appraisal-context feedback found.</p>
                )}
                {(suggestion.feedback_evidence || []).slice(0, 3).map((ev) => (
                  <div key={ev.id} className="rounded border p-3 text-sm">
                    <p className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleDateString()}</p>
                    <p>{ev.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>HR Decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">HR Notes</label>
                  <Textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">HR Decision</label>
                  <Input value={hrDecision} onChange={(e) => setHrDecision(e.target.value)} placeholder="Final decision / compensation guidance" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    className="w-full rounded border bg-background px-2 py-2 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AppraisalStatus)}
                  >
                    <option value="draft">Draft</option>
                    <option value="under_review">Under Review</option>
                    <option value="finalized">Finalized</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void handleSave()} disabled={saving}>
                    Save Changes
                  </Button>
                  <Button
                    className="bg-[#FFE500] text-black hover:bg-[#f5dc00]"
                    onClick={() => void handleSave("finalized")}
                    disabled={saving}
                  >
                    Finalize Appraisal
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  Salary action: {humanizeSalaryAction(suggestion.salary_action)} · Promotion eligible: {suggestion.promotion_eligible ? "Yes" : "No"}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
