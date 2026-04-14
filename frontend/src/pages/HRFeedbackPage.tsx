import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { MessageSquareText, Lightbulb, Search, Loader2 } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi, protectedPostApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type FeedbackItem = {
  id: string;
  employee_id: string;
  submitted_at: string;
  feedback_type: "pulse_survey" | "exit_interview" | "session_transcript" | "peer_review";
  raw_text: string;
  department: string;
  is_anonymous: boolean;
  sentiment_score: number;
  emotion_tags: Record<string, unknown>;
  themes: string[];
  analyzed_at?: string | null;
  analyzed_by_ai?: boolean;
};

type ListResponse = {
  items: FeedbackItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

type BatchSummary = {
  dominant_theme: string;
  avg_sentiment: number;
  sarcasm_count: number;
  critical_count: number;
  analyzed_count: number;
  department_most_affected: string;
  theme_frequency: Record<string, number>;
  sentiment_distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
};

type BatchResponse = {
  results: Array<{
    id: string;
    sarcasm_detected: boolean;
    risk_level: string;
    themes: string[];
    sentiment: {
      adjusted_polarity: number;
    };
    department: string;
  }>;
  batch_summary: BatchSummary;
};

type SingleResponse = FeedbackItem & {
  sentiment: {
    label: string;
    surface_polarity: number;
    sarcasm_adjusted_polarity: number;
  };
  sarcasm_detected: boolean;
  sarcasm_confidence: number;
  emotion_breakdown: Record<string, number>;
  key_phrases: string[];
  suggested_hr_action: string;
  risk_level: "low" | "medium" | "high" | "critical";
};

type OrgThemesResponse = {
  total_feedbacks: number;
  sarcasm_rate: number;
  critical_feedback_count: number;
};

type DatePreset = "7d" | "30d" | "90d" | "custom";

const DEPARTMENTS = ["Engineering", "Sales", "HR", "Design", "Finance", "Operations", "Marketing", "Product"];
const FEEDBACK_TYPES: Array<FeedbackItem["feedback_type"]> = [
  "pulse_survey",
  "exit_interview",
  "session_transcript",
  "peer_review",
];

const PIE_COLORS = ["#16a34a", "#6b7280", "#dc2626"];

function humanizeFeedbackType(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function calcDateRange(preset: DatePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (preset === "custom") {
    return {
      from: customFrom || undefined,
      to: customTo || undefined,
    };
  }

  const now = new Date();
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const from = new Date(now);
  from.setDate(now.getDate() - days);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

function markKeyPhrases(text: string, phrases: string[]): string {
  if (!phrases.length) {
    return text;
  }

  let highlighted = text;
  const escaped = phrases
    .filter((p) => p.length >= 3)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .slice(0, 8);

  for (const phrase of escaped) {
    const regex = new RegExp(`(${phrase})`, "ig");
    highlighted = highlighted.replace(regex, "<mark>$1</mark>");
  }
  return highlighted;
}

export default function HRFeedbackPage() {
  useDocumentTitle('NOVA — Feedback Analyzer');
  const { token } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [anonymousOnly, setAnonymousOnly] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");

  const [orgStats, setOrgStats] = useState<OrgThemesResponse | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [analysisMode, setAnalysisMode] = useState<"none" | "batch" | "single">("none");
  const [analyzingBatch, setAnalyzingBatch] = useState(false);
  const [analyzingSingleId, setAnalyzingSingleId] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResponse | null>(null);
  const [singleResult, setSingleResult] = useState<SingleResponse | null>(null);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    selectedDepartments.forEach((dep) => params.append("department", dep));
    selectedTypes.forEach((ft) => params.append("feedback_type", ft));
    if (sentimentFilter !== "all") {
      params.set("sentiment_range", sentimentFilter);
    }
    if (anonymousOnly) {
      params.set("is_anonymous", "true");
    }

    const range = calcDateRange(datePreset, customFrom, customTo);
    if (range.from) params.set("date_from", range.from);
    if (range.to) params.set("date_to", range.to);

    if (search.trim()) {
      params.set("search", search.trim());
    }

    params.set("page", String(page));
    params.set("page_size", "10");

    return `/api/hr/feedbacks?${params.toString()}`;
  }, [selectedDepartments, selectedTypes, sentimentFilter, anonymousOnly, datePreset, customFrom, customTo, search, page]);

  useEffect(() => {
    const loadFeedbacks = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const data = await protectedGetApi<ListResponse>(queryPath, token);
        setItems(data.items || []);
        setTotal(data.pagination.total || 0);
        setTotalPages(data.pagination.total_pages || 1);
      } catch (error) {
        toast({
          title: "Failed to load feedbacks",
          description: error instanceof Error ? error.message : "Could not fetch feedbacks",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadFeedbacks();
  }, [queryPath, token, toast]);

  useEffect(() => {
    const loadOrgStats = async () => {
      if (!token) return;
      try {
        const stats = await protectedGetApi<OrgThemesResponse>("/api/hr/feedbacks/org-themes", token);
        setOrgStats(stats);
      } catch {
        setOrgStats(null);
      }
    };
    void loadOrgStats();
  }, [token]);

  const clearFilters = () => {
    setSelectedDepartments([]);
    setSelectedTypes([]);
    setSentimentFilter("all");
    setAnonymousOnly(false);
    setDatePreset("30d");
    setCustomFrom("");
    setCustomTo("");
    setSearch("");
    setPage(1);
  };

  const toggleSelected = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const selectAllCurrentPage = () => {
    const next = new Set(selectedIds);
    items.forEach((item) => next.add(item.id));
    setSelectedIds(next);
  };

  const deselectAll = () => setSelectedIds(new Set());

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  };

  const runBatchAnalyze = async () => {
    if (!token || selectedIds.size === 0) return;
    setAnalyzingBatch(true);
    setAnalysisMode("batch");
    setSingleResult(null);

    try {
      const result = await protectedPostApi<BatchResponse>(
        "/api/hr/feedbacks/analyze-batch",
        token,
        { feedback_ids: Array.from(selectedIds) },
      );
      setBatchResult(result);
      toast({
        title: "Batch analysis complete",
        description: `Analyzed ${result.batch_summary.analyzed_count} feedbacks`,
      });
    } catch (error) {
      toast({
        title: "Batch analysis failed",
        description: error instanceof Error ? error.message : "Unable to analyze selected feedbacks",
        variant: "destructive",
      });
      setAnalysisMode("none");
    } finally {
      setAnalyzingBatch(false);
    }
  };

  const runSingleAnalyze = async (id: string) => {
    if (!token) return;
    setAnalyzingSingleId(id);
    setAnalysisMode("single");
    setBatchResult(null);

    try {
      const result = await protectedPostApi<SingleResponse>(`/api/hr/feedbacks/analyze-single/${id}`, token, {});
      setSingleResult(result);
    } catch (error) {
      toast({
        title: "Deep analysis failed",
        description: error instanceof Error ? error.message : "Unable to deeply analyze feedback",
        variant: "destructive",
      });
      setAnalysisMode("none");
    } finally {
      setAnalyzingSingleId(null);
    }
  };

  const addToAppraisalContext = async () => {
    if (!token || !singleResult) return;
    try {
      await protectedPostApi(`/api/hr/feedbacks/appraisal-context/${singleResult.id}`, token, {
        note: "Captured from deep feedback analysis",
      });
      toast({
        title: "Added to appraisal context",
        description: "Feedback has been pushed to the appraisal context queue.",
      });
    } catch (error) {
      toast({
        title: "Failed to add context",
        description: error instanceof Error ? error.message : "Could not add this feedback to appraisal context",
        variant: "destructive",
      });
    }
  };

  const downloadBatchReport = () => {
    if (!batchResult) return;
    const summary = batchResult.batch_summary;
    const doc = new jsPDF("p", "mm", "a4");

    doc.setFontSize(18);
    doc.text("NOVA HR Feedback Analysis Report", 14, 18);

    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Analyzed feedback count: ${summary.analyzed_count}`, 14, 35);
    doc.text(`Dominant theme: ${summary.dominant_theme}`, 14, 42);
    doc.text(`Average sentiment: ${summary.avg_sentiment.toFixed(3)}`, 14, 49);
    doc.text(`Sarcasm count: ${summary.sarcasm_count}`, 14, 56);
    doc.text(`Critical count: ${summary.critical_count}`, 14, 63);
    doc.text(`Most affected department: ${summary.department_most_affected}`, 14, 70);

    doc.text("Theme Frequency", 14, 84);
    let y = 92;
    Object.entries(summary.theme_frequency)
      .slice(0, 12)
      .forEach(([theme, count]) => {
        doc.text(`- ${theme}: ${count}`, 14, y);
        y += 6;
      });

    doc.save(`feedback-analysis-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const radarData = useMemo(() => {
    if (!singleResult?.emotion_breakdown) return [];
    return EMOTION_KEYS.map((key) => ({
      emotion: key,
      value: Number(singleResult.emotion_breakdown[key] ?? 0),
    }));
  }, [singleResult]);

  const pieData = useMemo(() => {
    if (!batchResult) return [];
    const dist = batchResult.batch_summary.sentiment_distribution;
    return [
      { name: "Positive", value: dist.positive },
      { name: "Neutral", value: dist.neutral },
      { name: "Negative", value: dist.negative },
    ];
  }, [batchResult]);

  const themeBarData = useMemo(() => {
    if (!batchResult) return [];
    return Object.entries(batchResult.batch_summary.theme_frequency)
      .slice(0, 6)
      .map(([theme, count]) => ({ theme, count }))
      .reverse();
  }, [batchResult]);

  const sarcasmDetectedCount = useMemo(() => {
    if (!orgStats) return 0;
    return Math.round(orgStats.sarcasm_rate * orgStats.total_feedbacks);
  }, [orgStats]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold">HR Feedback Analyzer</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Department</Label>
              <div className="space-y-2">
                {DEPARTMENTS.map((dep) => (
                  <label key={dep} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedDepartments.includes(dep)}
                      onCheckedChange={(checked) => {
                        const isChecked = checked === true;
                        setPage(1);
                        setSelectedDepartments((prev) =>
                          isChecked ? [...prev, dep] : prev.filter((item) => item !== dep),
                        );
                      }}
                    />
                    <span>{dep}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Feedback Type</Label>
              <div className="space-y-2">
                {FEEDBACK_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={(checked) => {
                        const isChecked = checked === true;
                        setPage(1);
                        setSelectedTypes((prev) =>
                          isChecked ? [...prev, type] : prev.filter((item) => item !== type),
                        );
                      }}
                    />
                    <span>{humanizeFeedbackType(type)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sentiment</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {["all", "positive", "neutral", "negative", "critical"].map((item) => (
                  <Button
                    key={item}
                    variant={sentimentFilter === item ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSentimentFilter(item);
                      setPage(1);
                    }}
                    className="justify-start"
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="anonymous-only">Anonymous only</Label>
              <Switch
                id="anonymous-only"
                checked={anonymousOnly}
                onCheckedChange={(checked) => {
                  setAnonymousOnly(Boolean(checked));
                  setPage(1);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "7d", label: "Last 7d" },
                  { key: "30d", label: "Last 30d" },
                  { key: "90d", label: "Last 90d" },
                  { key: "custom", label: "Custom" },
                ] as const).map((option) => (
                  <Button
                    key={option.key}
                    variant={datePreset === option.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setDatePreset(option.key);
                      setPage(1);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {datePreset === "custom" && (
                <div className="grid grid-cols-1 gap-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => {
                      setCustomFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => {
                      setCustomTo(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search feedback text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <button type="button" className="text-sm text-primary underline" onClick={clearFilters}>
              Clear All Filters
            </button>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>Total feedbacks: <strong>{orgStats?.total_feedbacks ?? total}</strong></p>
              <p>Critical: <strong>{orgStats?.critical_feedback_count ?? 0}</strong></p>
              <p>Sarcasm detected: <strong>{sarcasmDetectedCount}</strong></p>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Employee Feedbacks ({total})</CardTitle>
              <Button onClick={runBatchAnalyze} disabled={selectedIds.size === 0 || analyzingBatch}>
                {analyzingBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Analyze Selected
              </Button>
            </div>
            <div className="flex gap-3 text-sm">
              <button type="button" className="underline" onClick={selectAllCurrentPage}>Select All</button>
              <button type="button" className="underline" onClick={deselectAll}>Deselect All</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading feedbacks...
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No feedbacks match the current filters.
              </div>
            )}

            {items.map((item) => {
              const sarcasmDetected = Boolean((item.emotion_tags || {}).sarcasm_detected);
              const expanded = expandedIds.has(item.id);
              const score = Number(item.sentiment_score || 0);
              const dotColor = score > 0.2 ? "bg-green-500" : score < -0.2 ? "bg-red-500" : "bg-amber-500";

              return (
                <div key={item.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <label className="mt-1">
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                      />
                    </label>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.department}</Badge>
                      <Badge>{humanizeFeedbackType(item.feedback_type)}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(item.submitted_at)}</span>
                    </div>
                  </div>

                  <div className="mb-2 text-sm text-muted-foreground">
                    {item.is_anonymous ? (
                      <Badge variant="secondary">Anonymous</Badge>
                    ) : (
                      <span>Employee {item.employee_id}</span>
                    )}
                  </div>

                  <p className="text-sm">
                    {expanded ? item.raw_text : truncate(item.raw_text, 120)}{" "}
                    {item.raw_text.length > 120 && (
                      <button type="button" className="text-primary underline" onClick={() => toggleExpanded(item.id)}>
                        {expanded ? "Show less" : "Read more"}
                      </button>
                    )}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                      {score.toFixed(2)}
                    </span>
                    {sarcasmDetected && <Badge variant="destructive">Sarcasm Detected</Badge>}
                    {(item.themes || []).slice(0, 3).map((theme) => (
                      <Badge key={theme} variant="secondary">{theme}</Badge>
                    ))}
                    <button
                      type="button"
                      className="ml-auto text-primary underline"
                      onClick={() => void runSingleAnalyze(item.id)}
                      disabled={analyzingSingleId === item.id}
                    >
                      {analyzingSingleId === item.id ? "Analyzing..." : "Deep Analyze ->"}
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Analysis Panel</CardTitle>
          </CardHeader>
          <CardContent>
            {analysisMode === "none" && (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Select feedbacks and click Analyze Selected, or click Deep Analyze on any feedback.
              </div>
            )}

            {analysisMode === "batch" && analyzingBatch && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running batch analysis...
              </div>
            )}

            {analysisMode === "batch" && batchResult && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Dominant Theme</p>
                  <p className="text-xl font-bold">{batchResult.batch_summary.dominant_theme}</p>
                </div>

                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={74} label>
                        {pieData.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={themeBarData} layout="vertical" margin={{ left: 24, right: 12 }}>
                      <XAxis type="number" />
                      <YAxis dataKey="theme" type="category" width={90} />
                      <RechartsTooltip />
                      <Bar dataKey="count" fill="#0f766e" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-sm">
                  Sarcasm Rate: {batchResult.batch_summary.sarcasm_count} of {batchResult.batch_summary.analyzed_count} analyzed feedbacks
                </p>
                <Badge variant="destructive">Critical Count: {batchResult.batch_summary.critical_count}</Badge>
                <p className="text-sm">Department most affected: {batchResult.batch_summary.department_most_affected}</p>

                <Button onClick={downloadBatchReport}>Download Analysis Report</Button>
              </div>
            )}

            {analysisMode === "single" && analyzingSingleId && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running deep analysis...
              </div>
            )}

            {analysisMode === "single" && singleResult && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 text-sm">
                  <p
                    dangerouslySetInnerHTML={{
                      __html: markKeyPhrases(singleResult.raw_text, singleResult.key_phrases || []),
                    }}
                  />
                </div>

                {singleResult.sarcasm_detected && (
                  <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                    Sarcasm detected with {(singleResult.sarcasm_confidence * 100).toFixed(0)}% confidence. Actual sentiment may differ from surface text.
                    <div className="mt-2">
                      Surface sentiment: {singleResult.sentiment.surface_polarity.toFixed(2)} | Sarcasm-adjusted sentiment: {singleResult.sentiment.sarcasm_adjusted_polarity.toFixed(2)}
                    </div>
                  </div>
                )}

                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="emotion" />
                      <PolarRadiusAxis domain={[0, 1]} />
                      <Radar dataKey="value" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.5} />
                      <RechartsTooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Risk Level:</span>
                  <Badge
                    variant={
                      singleResult.risk_level === "critical" || singleResult.risk_level === "high"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-sm"
                  >
                    {singleResult.risk_level.toUpperCase()}
                  </Badge>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <Lightbulb className="h-4 w-4" />
                    Suggested HR Action
                  </div>
                  <p>{singleResult.suggested_hr_action}</p>
                </div>

                <Button onClick={addToAppraisalContext}>Add to Appraisal Context</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const EMOTION_KEYS = ["stress", "frustration", "disengagement", "satisfaction", "enthusiasm", "anxiety"];
