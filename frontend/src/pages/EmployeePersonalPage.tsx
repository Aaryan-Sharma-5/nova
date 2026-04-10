import { FormEvent, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi, protectedPostApi } from "@/lib/api";

interface PersonalDataResponse {
  employee_id: string;
  engagement_level: "Low" | "Medium" | "High";
  burnout_risk_category: "Low" | "Medium" | "High";
  sentiment_trend: "Improving" | "Stable" | "Declining";
  data_fields_held: string[];
  source: string;
}

interface EmployeeFeedbackSession {
  id: string;
  scheduled_date: string;
  status: "scheduled" | "completed" | "skipped";
}

function levelColor(level: string): string {
  if (level === "High") {
    return "bg-amber-100 text-amber-900 border-amber-300";
  }
  if (level === "Medium") {
    return "bg-sky-100 text-sky-900 border-sky-300";
  }
  return "bg-emerald-100 text-emerald-900 border-emerald-300";
}

export default function EmployeePersonalPage() {
  const { token } = useAuth();

  const [data, setData] = useState<PersonalDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [feedbackCategory, setFeedbackCategory] = useState("wellness");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [pendingSession, setPendingSession] = useState<EmployeeFeedbackSession | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!token) {
        return;
      }

      setLoading(true);
      try {
        const response = await protectedGetApi<PersonalDataResponse>("/api/me/data", token);
        const sessionsResponse = await protectedGetApi<{ sessions: EmployeeFeedbackSession[] }>(
          "/api/feedback/sessions/my",
          token,
        );
        const nextSession = (sessionsResponse.sessions || []).find((session) => session.status === "scheduled") || null;
        if (mounted) {
          setData(response);
          setPendingSession(nextSession);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setData(null);
          setError(err instanceof Error ? err.message : "Failed to load your data");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [token]);

  const submitFeedback = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !feedbackMessage.trim()) {
      return;
    }

    setFeedbackStatus("Submitting...");
    try {
      await protectedPostApi<{ status: string; message: string }>(
        "/api/me/feedback",
        token,
        {
          category: feedbackCategory,
          message: feedbackMessage.trim(),
        },
      );
      setFeedbackMessage("");
      setFeedbackStatus("Feedback submitted. Thank you.");
    } catch (err) {
      setFeedbackStatus(err instanceof Error ? err.message : "Failed to submit feedback");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Data</h1>
        <p className="text-sm text-muted-foreground">Transparent view of wellness signals and data categories held for your account.</p>
      </div>

      {pendingSession && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            You have a mandatory feedback session due by {new Date(pendingSession.scheduled_date).toLocaleDateString()}.{' '}
            <a href="/feedback-session" className="underline">Complete it here -&gt;</a>
          </p>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading your profile...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-3">Your Wellness Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className={`border rounded-lg p-4 ${levelColor(data.engagement_level)}`}>
                <p className="text-xs uppercase tracking-wide">Engagement Level</p>
                <p className="text-xl font-bold mt-1">{data.engagement_level}</p>
              </div>
              <div className={`border rounded-lg p-4 ${levelColor(data.burnout_risk_category)}`}>
                <p className="text-xs uppercase tracking-wide">Burnout Risk Category</p>
                <p className="text-xl font-bold mt-1">{data.burnout_risk_category}</p>
              </div>
              <div className={`border rounded-lg p-4 ${data.sentiment_trend === "Declining" ? "bg-rose-100 text-rose-900 border-rose-300" : data.sentiment_trend === "Improving" ? "bg-emerald-100 text-emerald-900 border-emerald-300" : "bg-slate-100 text-slate-900 border-slate-300"}`}>
                <p className="text-xs uppercase tracking-wide">Sentiment Trend</p>
                <p className="text-xl font-bold mt-1">{data.sentiment_trend}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-3">Data We Hold About You</h2>
            <p className="text-sm text-muted-foreground mb-3">These are data types used for wellbeing insights. Raw values are not shown here.</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.data_fields_held.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-3">Share Feedback</h2>
            <form className="space-y-3" onSubmit={submitFeedback}>
              <div>
                <p className="text-sm mb-1">Category</p>
                <Select value={feedbackCategory} onValueChange={setFeedbackCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wellness">Wellness</SelectItem>
                    <SelectItem value="data_accuracy">Data Accuracy</SelectItem>
                    <SelectItem value="privacy">Privacy</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-sm mb-1">Message</p>
                <textarea
                  className="w-full min-h-[120px] rounded-md border p-3 text-sm"
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Tell us your feedback about your wellness dashboard or data transparency..."
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit">Submit Feedback</Button>
                {feedbackStatus && <p className="text-sm text-muted-foreground">{feedbackStatus}</p>}
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
