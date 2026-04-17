import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MessageSquare, Award, TrendingUp, AlertCircle, Trophy } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { protectedGetApi, protectedPostApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/contexts/EmployeeContext";

type FlightRiskEvent = {
  type: "review" | "one-on-one" | "milestone" | "sentiment-shift";
  date: string;
  description: string;
  impact: "positive" | "negative" | "neutral";
};

type MeetingItem = {
  id: string;
  employee_id: string;
  scheduled_date: string;
  notes?: string;
  status: "pending" | "confirmed" | "completed";
  urgency: "normal" | "urgent";
};

type RecognitionItem = {
  id: string;
  recognition_type: string;
  message: string;
  created_at: string;
};

type MessageType = "general" | "action_required" | "recognition";

interface FlightRiskDrawerProps {
  employeeId: string | null;
  employeeName: string;
  open: boolean;
  onClose: () => void;
}

function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function fireConfetti(): Promise<void> {
  if (!(window as any).confetti) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector("script[data-confetti='true']");
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
      script.async = true;
      script.setAttribute("data-confetti", "true");
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Unable to load confetti script"));
      document.body.appendChild(script);
    });
  }

  const confetti = (window as any).confetti;
  if (typeof confetti === "function") {
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  }
}

export default function FlightRiskDrawer({ employeeId, employeeName, open, onClose }: FlightRiskDrawerProps) {
  const { token, user } = useAuth();
  const { getEmployee } = useEmployees();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [recognitionOpen, setRecognitionOpen] = useState(false);

  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);

  const [meetingDate, setMeetingDate] = useState(toDateInputValue(defaultDate));
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [meetingUrgency, setMeetingUrgency] = useState<"normal" | "urgent">("normal");
  const [meetingNotes, setMeetingNotes] = useState("Sentiment dropped significantly recently. Check in and unblock concerns.");
  const [rescheduleMode, setRescheduleMode] = useState(false);

  const [msgType, setMsgType] = useState<MessageType>("general");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");

  const [recType, setRecType] = useState("above_and_beyond");
  const [recMessage, setRecMessage] = useState("");
  const [recPublic, setRecPublic] = useState(true);

  const data = useMemo(() => {
    if (!employeeId) return null;
    const employee = getEmployee(employeeId);
    if (!employee) return null;

    const riskScores = Array.from({ length: 10 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (9 - index) * 10);
      const score = Math.max(0, Math.min(100, Math.round(employee.attritionRisk + (index - 4) * 1.5)));
      return { date: date.toISOString().slice(0, 10), score };
    });

    const events: FlightRiskEvent[] = [
      {
        type: "sentiment-shift",
        date: riskScores[Math.max(0, riskScores.length - 4)]?.date || riskScores[0].date,
        description: "Sentiment trend changed in recent check-ins",
        impact: employee.sentimentScore < 0 ? "negative" : "positive",
      },
      {
        type: "review",
        date: riskScores[Math.max(0, riskScores.length - 2)]?.date || riskScores[0].date,
        description: "Latest performance snapshot generated",
        impact: employee.performanceScore > 70 ? "positive" : "neutral",
      },
    ];

    return { riskScores, events };
  }, [employeeId, getEmployee]);

  useEffect(() => {
    const load = async () => {
      if (!open || !token || !employeeId) {
        return;
      }
      try {
        const meetingPayload = await protectedGetApi<{ meetings: MeetingItem[] }>(`/api/meetings?employee_id=${encodeURIComponent(employeeId)}`, token);
        setMeetings(meetingPayload.meetings || []);
      } catch {
        setMeetings([]);
      }

      try {
        const recPayload = await protectedGetApi<{ recognitions: RecognitionItem[] }>(`/api/recognition/${encodeURIComponent(employeeId)}`, token);
        setRecognitions(recPayload.recognitions || []);
      } catch {
        setRecognitions([]);
      }
    };

    void load();
  }, [open, token, employeeId]);

  if (!employeeId || !data) return null;

  const currentRisk = data.riskScores[data.riskScores.length - 1].score;

  const getRiskColor = (score: number): string => {
    if (score >= 70) return "#ef4444";
    if (score >= 50) return "#f59e0b";
    if (score >= 30) return "#eab308";
    return "#22c55e";
  };

  const getEventIcon = (type: FlightRiskEvent["type"]) => {
    switch (type) {
      case "review":
        return <Award className="h-4 w-4" />;
      case "one-on-one":
        return <MessageSquare className="h-4 w-4" />;
      case "milestone":
        return <TrendingUp className="h-4 w-4" />;
      case "sentiment-shift":
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const timelineEvents = [
    ...data.events,
    ...meetings.slice(0, 5).map((meeting) => ({
      type: "one-on-one" as const,
      date: meeting.scheduled_date,
      description: `Meeting Scheduled (${meeting.urgency})`,
      impact: "neutral" as const,
    })),
    ...recognitions.slice(0, 5).map((recognition) => ({
      type: "milestone" as const,
      date: recognition.created_at,
      description: `?? ${recognition.recognition_type.replaceAll("_", " ")}: ${recognition.message}`,
      impact: "positive" as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const nextSevenDayMeeting = meetings.find((meeting) => {
    const when = new Date(meeting.scheduled_date).getTime();
    const now = Date.now();
    const in7 = now + 7 * 24 * 3600 * 1000;
    return when >= now && when <= in7;
  });

  const submitSchedule = async () => {
    if (!token || !employeeId || !user) return;
    const suggested = new Date(`${meetingDate}T${meetingTime}:00`);

    const payload = await protectedPostApi<{ already_scheduled: boolean; message: string; meeting?: MeetingItem }>(
      "/api/meetings/schedule",
      token,
      {
        employee_id: employeeId,
        manager_id: user.email,
        suggested_date: suggested.toISOString(),
        meeting_type: "1on1",
        notes: meetingNotes,
        urgency: meetingUrgency,
        force_reschedule: rescheduleMode,
      },
    );

    toast({ title: payload.already_scheduled ? "Already scheduled" : "Success", description: payload.message });
    setScheduleOpen(false);
    setRescheduleMode(false);

    const refreshed = await protectedGetApi<{ meetings: MeetingItem[] }>(`/api/meetings?employee_id=${encodeURIComponent(employeeId)}`, token);
    setMeetings(refreshed.meetings || []);
  };

  const submitMessage = async () => {
    if (!token || !employeeId || !user) return;
    if (msgBody.trim().length < 10) {
      toast({ title: "Message too short", description: "Body must be at least 10 characters." });
      return;
    }

    await protectedPostApi(
      "/api/messages/send",
      token,
      {
        to_employee_id: employeeId,
        from_user_id: user.email,
        subject: msgSubject || "Quick check-in",
        body: msgBody,
        message_type: msgType,
      },
    );

    toast({ title: "Message sent", description: `Message sent to ${employeeName}` });
    setMessageOpen(false);
    setMsgBody("");
    setMsgSubject("");
  };

  const submitRecognition = async () => {
    if (!token || !employeeId || !user) return;
    if (!recMessage.trim()) {
      toast({ title: "Recognition note required", description: "Please add a personal note." });
      return;
    }

    await protectedPostApi(
      "/api/recognition/send",
      token,
      {
        employee_id: employeeId,
        given_by: user.email,
        recognition_type: recType,
        message: recMessage,
        is_public: recPublic,
      },
    );

    await fireConfetti();
    toast({ title: "Recognition sent", description: `Recognition sent to ${employeeName}!` });
    setRecognitionOpen(false);

    const refreshed = await protectedGetApi<{ recognitions: RecognitionItem[] }>(`/api/recognition/${encodeURIComponent(employeeId)}`, token);
    setRecognitions(refreshed.recognitions || []);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-xl">{employeeName} - Flight Risk Analysis</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <Card className="p-4 bg-gradient-to-r from-red-50 to-orange-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Flight Risk Score</p>
                  <p className="text-4xl font-bold mt-1" style={{ color: getRiskColor(currentRisk) }}>
                    {currentRisk.toFixed(0)}
                  </p>
                </div>
                <Badge className="text-base px-4 py-2" style={{ backgroundColor: getRiskColor(currentRisk), color: "white" }}>
                  {currentRisk >= 70 ? "High Risk" : currentRisk >= 50 ? "Moderate" : "Low Risk"}
                </Badge>
              </div>
            </Card>

            <div>
              <h3 className="text-sm font-semibold mb-3">90-Day Risk Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data.riskScores}>
                  <defs>
                    <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(date) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={2} fill="url(#riskGradient)" />
                  {timelineEvents.map((event, index) => {
                    const point = data.riskScores.find((score) => score.date === event.date);
                    return point ? (
                      <ReferenceDot
                        key={`${event.date}-${index}`}
                        x={event.date}
                        y={point.score}
                        r={6}
                        fill={event.impact === "positive" ? "#22c55e" : event.impact === "negative" ? "#ef4444" : "#64748b"}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ) : null;
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Key Events Timeline</h3>
              <div className="space-y-3">
                {timelineEvents.map((event, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="mt-0.5">{getEventIcon(event.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold capitalize">{event.type.replace("-", " ")}</p>
                        <span className="text-xs">{new Date(event.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t">
              <Button
                variant="default"
                className="w-full"
                onClick={() => {
                  if (nextSevenDayMeeting) {
                    const nextDate = new Date(nextSevenDayMeeting.scheduled_date);
                    setMeetingDate(toDateInputValue(nextDate));
                    setMeetingTime(nextDate.toISOString().slice(11, 16));
                    setMeetingNotes(nextSevenDayMeeting.notes || meetingNotes);
                    setRescheduleMode(true);
                    toast({ title: "Already scheduled", description: `1:1 already scheduled for ${new Date(nextSevenDayMeeting.scheduled_date).toLocaleString()}. You can reschedule now.` });
                    setScheduleOpen(true);
                    return;
                  }
                  setRescheduleMode(false);
                  setScheduleOpen(true);
                }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Schedule 1:1
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setMessageOpen(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Send Message
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setRecognitionOpen(true)}>
                <Award className="h-4 w-4 mr-2" />
                Recognition
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate(`/employees/${employeeId}/profile`)}>
                <TrendingUp className="h-4 w-4 mr-2" />
                View Full Profile
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rescheduleMode ? "Reschedule 1:1" : "Schedule 1:1"} with {employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>
              <div>
                <Label>Time</Label>
                <Select value={meetingTime} onValueChange={setMeetingTime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"].map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Urgency</Label>
              <Select value={meetingUrgency} onValueChange={(value: "normal" | "urgent") => setMeetingUrgency(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void submitSchedule()}>{rescheduleMode ? "Confirm Reschedule" : "Confirm Schedule"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message to {employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>To</Label>
              <Input value={employeeName} readOnly />
            </div>
            <div>
              <Label>Message Type</Label>
              <Select value={msgType} onValueChange={(value: MessageType) => setMsgType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="action_required">Action Required</SelectItem>
                  <SelectItem value="recognition">Recognition</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void submitMessage()}>Send</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recognitionOpen} onOpenChange={setRecognitionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recognize {employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Recognition Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["above_and_beyond", "?? Above & Beyond"],
                ["team_player", "?? Team Player"],
                ["innovation", "?? Innovation"],
                ["milestone", "?? Milestone"],
                ["customer_impact", "?? Customer Impact"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded border p-2 text-left text-sm ${recType === value ? "border-primary bg-primary/10" : "border-border"}`}
                  onClick={() => setRecType(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <Label>Personal Note</Label>
              <Textarea
                value={recMessage}
                onChange={(e) => setRecMessage(e.target.value)}
                placeholder="Write a personal note (visible to employee)"
              />
            </div>
            <div className="flex items-center justify-between rounded border p-2">
              <span className="text-sm">Make this public to team</span>
              <Button variant="outline" size="sm" onClick={() => setRecPublic((value) => !value)}>
                {recPublic ? "Public" : "Private"}
              </Button>
            </div>
            <Button className="w-full" onClick={() => void submitRecognition()}>
              <Trophy className="h-4 w-4 mr-2" />
              Send Recognition
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
