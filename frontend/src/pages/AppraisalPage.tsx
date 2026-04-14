import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import jsPDF from "jspdf";
import { ClipboardList, Check, ArrowUpCircle, CircleDashed } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi, protectedPostApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AppraisalReviewDrawer } from "@/components/appraisal/AppraisalReviewDrawer";
import { AppraisalSuggestion, AppraisalSummary } from "@/types/appraisal";

type SuggestionsResponse = {
  items: AppraisalSuggestion[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

const DEPARTMENTS = ["Engineering", "Sales", "HR", "Design", "Finance", "Operations", "Marketing", "Product"];
const CATEGORIES = [
  "Exceptional — Fast Track Promotion",
  "High Performer — Standard Promotion + Raise",
  "Meets Expectations — Merit Increment",
  "Needs Improvement — PIP Consideration",
  "Critical — Intervention Required Before Review",
];

function categoryBadgeClass(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.startsWith("exceptional")) return "bg-yellow-100 text-yellow-900";
  if (normalized.startsWith("high performer")) return "bg-emerald-100 text-emerald-900";
  if (normalized.startsWith("meets expectations")) return "bg-sky-100 text-sky-900";
  if (normalized.startsWith("needs improvement")) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-900";
}

function gaugeStyle(score: number): React.CSSProperties {
  const safe = Math.max(0, Math.min(100, score));
  return {
    background: `conic-gradient(#FFE500 ${safe * 3.6}deg, #e5e7eb 0deg)`,
  };
}

function salaryActionLabel(action: string): string {
  if (action.startsWith("increment_")) {
    return `↑ ${action.replace("increment_", "")} increment`;
  }
  if (action === "no_change") {
    return "No change";
  }
  return "Under review";
}

function reviewFlagLabel(flag: string): string {
  if (flag === "fast_track") return "Fast Track";
  if (flag === "pip") return "PIP";
  if (flag === "monitor") return "Monitor";
  return "—";
}

function statusLabel(status: string): string {
  if (status === "under_review") return "Under Review";
  if (status === "finalized") return "Finalized";
  return "Draft";
}

export default function AppraisalPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<AppraisalSuggestion[]>([]);
  const [summary, setSummary] = useState<AppraisalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPromotionEligible, setFilterPromotionEligible] = useState("");
  const [filterReviewFlag, setFilterReviewFlag] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [sortKey, setSortKey] = useState<"score" | "category" | "department">("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [runDepartment, setRunDepartment] = useState("Engineering");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AppraisalSuggestion | null>(null);

  const selectedEmployeeFromQuery = searchParams.get("employeeId") || "";

  const loadSummary = async () => {
    if (!token) return;
    try {
      const payload = await protectedGetApi<AppraisalSummary>("/api/appraisals/summary", token);
      setSummary(payload);
    } catch {
      setSummary(null);
    }
  };

  const loadSuggestions = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", "20");
      if (filterDepartment) params.set("department", filterDepartment);
      if (filterCategory) params.set("category", filterCategory);
      if (filterPromotionEligible) params.set("promotion_eligible", filterPromotionEligible);
      if (filterReviewFlag) params.set("review_flag", filterReviewFlag);
      if (filterStatus) params.set("status", filterStatus);

      const payload = await protectedGetApi<SuggestionsResponse>(`/api/appraisals/suggestions?${params.toString()}`, token);
      setItems(payload.items || []);
      setTotalPages(payload.pagination.total_pages || 1);

      if (selectedEmployeeFromQuery) {
        const match = (payload.items || []).find((item) => item.employee_id === selectedEmployeeFromQuery);
        if (match) {
          setSelectedSuggestion(match);
          setDrawerOpen(true);
        }
      }
    } catch (error) {
      toast({
        title: "Failed to load appraisal suggestions",
        description: error instanceof Error ? error.message : "Unable to fetch data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
    void loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, filterDepartment, filterCategory, filterPromotionEligible, filterReviewFlag, filterStatus]);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      if (sortKey === "score") {
        left = Number(a.composite_score || 0);
        right = Number(b.composite_score || 0);
      } else if (sortKey === "category") {
        left = a.category || "";
        right = b.category || "";
      } else {
        left = a.employee?.department || a.department || "";
        right = b.employee?.department || b.department || "";
      }

      if (typeof left === "number" && typeof right === "number") {
        return sortDirection === "asc" ? left - right : right - left;
      }

      const cmp = String(left).localeCompare(String(right));
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortDirection, sortKey]);

  const runGenerateDepartment = async () => {
    if (!token) return;
    setGenerating(true);
    try {
      await protectedPostApi("/api/appraisals/generate-batch", token, { department: runDepartment });
      await loadSummary();
      await loadSuggestions();
      toast({ title: `Generated appraisals for ${runDepartment}` });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Could not generate appraisals",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const runGenerateAll = async () => {
    if (!token) return;
    setGenerating(true);
    try {
      await protectedPostApi("/api/appraisals/generate-batch", token, {});
      await loadSummary();
      await loadSuggestions();
      toast({ title: "Generated appraisals for all employees" });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Could not run full generation",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = () => {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(16);
    doc.text("NOVA Appraisal Report", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);

    let y = 34;
    sortedItems.forEach((item, index) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      const name = item.employee?.name || item.employee_name || item.employee_id;
      const dept = item.employee?.department || item.department || "Unknown";
      const line = `${index + 1}. ${name} | ${dept} | ${item.composite_score.toFixed(1)} | ${item.category} | ${statusLabel(item.status)}`;
      const wrapped = doc.splitTextToSize(line, 180);
      doc.text(wrapped, 14, y);
      y += 6 + (wrapped.length - 1) * 4;
    });

    doc.save(`appraisal-report-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const updateAfterReview = (updated: AppraisalSuggestion) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    setSelectedSuggestion(updated);
    void loadSummary();
  };

  const categoryDistribution = summary?.category_distribution || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Appraisal Cycle Management</h1>
          <p className="text-sm text-muted-foreground">AI-generated suggestions based on performance, engagement, and feedback data</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded border bg-background px-2 py-2 text-sm"
            value={runDepartment}
            onChange={(e) => setRunDepartment(e.target.value)}
          >
            {DEPARTMENTS.map((dep) => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
          <Button onClick={() => void runGenerateDepartment()} disabled={generating}>Run</Button>
          {user?.role === "leadership" && (
            <Button variant="outline" onClick={() => void runGenerateAll()} disabled={generating}>
              Generate for All Employees
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-4 text-sm">
          <Badge className="bg-yellow-100 text-yellow-900">Exceptional: {categoryDistribution["Exceptional — Fast Track Promotion"] || 0}</Badge>
          <Badge className="bg-emerald-100 text-emerald-900">High Performer: {categoryDistribution["High Performer — Standard Promotion + Raise"] || 0}</Badge>
          <Badge className="bg-sky-100 text-sky-900">Meets Expectations: {categoryDistribution["Meets Expectations — Merit Increment"] || 0}</Badge>
          <Badge className="bg-amber-100 text-amber-900">Needs Improvement: {categoryDistribution["Needs Improvement — PIP Consideration"] || 0}</Badge>
          <Badge className="bg-red-100 text-red-900">Critical: {categoryDistribution["Critical — Intervention Required Before Review"] || 0}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Appraisal Suggestions</span>
            <Button variant="outline" onClick={exportPdf}>Export Appraisal Report</Button>
          </CardTitle>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select className="rounded border bg-background px-2 py-2 text-sm" value={filterDepartment} onChange={(e) => { setPage(1); setFilterDepartment(e.target.value); }}>
              <option value="">Department</option>
              {DEPARTMENTS.map((dep) => <option key={dep} value={dep}>{dep}</option>)}
            </select>

            <select className="rounded border bg-background px-2 py-2 text-sm" value={filterCategory} onChange={(e) => { setPage(1); setFilterCategory(e.target.value); }}>
              <option value="">Category</option>
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            <select className="rounded border bg-background px-2 py-2 text-sm" value={filterPromotionEligible} onChange={(e) => { setPage(1); setFilterPromotionEligible(e.target.value); }}>
              <option value="">Promotion Eligible</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>

            <select className="rounded border bg-background px-2 py-2 text-sm" value={filterReviewFlag} onChange={(e) => { setPage(1); setFilterReviewFlag(e.target.value); }}>
              <option value="">Review Flag</option>
              <option value="fast_track">Fast Track</option>
              <option value="pip">PIP</option>
              <option value="monitor">Monitor</option>
              <option value="none">None</option>
            </select>

            <select className="rounded border bg-background px-2 py-2 text-sm" value={filterStatus} onChange={(e) => { setPage(1); setFilterStatus(e.target.value); }}>
              <option value="">Status</option>
              <option value="draft">Draft</option>
              <option value="under_review">Under Review</option>
              <option value="finalized">Finalized</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => { setSortKey("department"); setSortDirection((d) => d === "asc" ? "desc" : "asc"); }}>
                      Department
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => { setSortKey("score"); setSortDirection((d) => d === "asc" ? "desc" : "asc"); }}>
                      Score
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => { setSortKey("category"); setSortDirection((d) => d === "asc" ? "desc" : "asc"); }}>
                      Category
                    </button>
                  </th>
                  <th className="px-3 py-2">Salary Action</th>
                  <th className="px-3 py-2">Promotion</th>
                  <th className="px-3 py-2">Flag</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={9}>Loading...</td>
                  </tr>
                )}

                {!loading && sortedItems.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={9}>No appraisal suggestions found.</td>
                  </tr>
                )}

                {!loading && sortedItems.map((item) => {
                  const employeeName = item.employee?.name || item.employee_name || item.employee_id;
                  const employeeRole = item.employee?.role || item.employee_role || "Unknown role";
                  const department = item.employee?.department || item.department || "Unknown";
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border font-semibold">
                            {employeeName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <p className="font-medium">{employeeName}</p>
                            <p className="text-xs text-muted-foreground">{employeeRole}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{department}</td>
                      <td className="px-3 py-2">
                        <div className="relative h-10 w-10 rounded-full" style={gaugeStyle(item.composite_score)}>
                          <div className="absolute inset-[4px] flex items-center justify-center rounded-full bg-background text-[10px] font-bold">
                            {Math.round(item.composite_score)}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2"><Badge className={categoryBadgeClass(item.category)}>{item.category}</Badge></td>
                      <td className="px-3 py-2">{salaryActionLabel(item.salary_action)}</td>
                      <td className="px-3 py-2">{item.promotion_eligible ? <Check className="h-4 w-4 text-emerald-600" /> : <CircleDashed className="h-4 w-4 text-muted-foreground" />}</td>
                      <td className="px-3 py-2">{reviewFlagLabel(item.review_flag)}</td>
                      <td className="px-3 py-2">{statusLabel(item.status)}</td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            setSelectedSuggestion(item);
                            setDrawerOpen(true);
                            if (token) {
                              try {
                                const latest = await protectedGetApi<AppraisalSuggestion>(`/api/appraisals/suggestions/${item.employee_id}/latest`, token);
                                setSelectedSuggestion(latest);
                              } catch {
                                // fallback to selected table row
                              }
                            }
                          }}
                        >
                          Review →
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <p className="text-xs text-muted-foreground">Page {page} / {totalPages}</p>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        </CardContent>
      </Card>

      <AppraisalReviewDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        suggestion={selectedSuggestion}
        onUpdated={updateAfterReview}
      />
    </div>
  );
}
