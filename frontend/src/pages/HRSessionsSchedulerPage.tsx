import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ShieldAlert, MessageSquareReply, CheckCircle2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployees } from '@/contexts/EmployeeContext';
import { protectedPostApi } from '@/lib/api';

type ScheduleResponse = {
  scheduled_count: number;
  mandatory: boolean;
  scheduled_by: string;
  sessions: Array<{ id: string; employee_id: string; scheduled_date: string; status: string }>;
};

type TargetMode = 'employee' | 'department';

function defaultLocalDateTime(hoursAhead = 24): string {
  const date = new Date();
  date.setHours(date.getHours() + hoursAhead);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function HRSessionsSchedulerPage() {
  useDocumentTitle('NOVA — Schedule Sessions');
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { employees } = useEmployees();

  const [targetMode, setTargetMode] = useState<TargetMode>('employee');
  const [employeeEmail, setEmployeeEmail] = useState(employees[0]?.email ?? 'employee@company.com');
  const [department, setDepartment] = useState(employees[0]?.department ?? 'Engineering');
  const [scheduledAt, setScheduledAt] = useState(defaultLocalDateTime());
  const [mandatory, setMandatory] = useState(true);
  const [sendReminder, setSendReminder] = useState(true);
  const [reminderNote, setReminderNote] = useState('Please complete the recorded feedback session by the scheduled deadline.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const uniqueDepartments = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.department))).sort(),
    [employees],
  );

  const targetLabel = targetMode === 'employee' ? employeeEmail : department;

  const submitSchedule = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    setWarning('');

    try {
      const scheduledDate = new Date(scheduledAt).toISOString();
      const payload = targetMode === 'employee'
        ? { employee_id: employeeEmail, scheduled_date: scheduledDate, mandatory }
        : { department, scheduled_date: scheduledDate, mandatory };

      const response = await protectedPostApi<ScheduleResponse>('/api/feedback/sessions/schedule', token, payload);
      setResult(response);

      if (sendReminder && response.sessions?.length) {
        try {
          for (const session of response.sessions) {
            await protectedPostApi('/api/messages/send', token, {
              to_employee_id: session.employee_id,
              from_user_id: user?.email ?? 'hr@company.com',
              subject: 'Mandatory feedback session scheduled',
              body: `${reminderNote}\n\nScheduled for ${new Date(session.scheduled_date).toLocaleString()}.\nThis is a recorded session and attendance is required.`,
              message_type: 'action_required',
            });
          }
        } catch (reminderErr) {
          const reminderMessage = reminderErr instanceof Error ? reminderErr.message : 'Unable to send reminder message';
          setWarning(`Session scheduled, but reminder could not be sent: ${reminderMessage}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule session');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule Feedback Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Create recorded, time-bound sessions that increase accountability and reduce retroactive fabrication.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/hr/sessions-review')}>
          Review Queue
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Session Scheduler</CardTitle>
            <CardDescription>
              HireVue-style scheduling with a clear audit trail, mandatory reminders, and a fixed delivery window.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target type</Label>
                <Select value={targetMode} onValueChange={(value) => setTargetMode(value as TargetMode)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Single employee</SelectItem>
                    <SelectItem value="department">Entire department</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scheduled for</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              </div>
            </div>

            {targetMode === 'employee' ? (
              <div className="space-y-2">
                <Label>Employee email</Label>
                <Select value={employeeEmail} onValueChange={setEmployeeEmail}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.slice(0, 30).map((employee) => (
                      <SelectItem key={employee.id} value={employee.email}>
                        {employee.name} - {employee.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueDepartments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reminder note</Label>
              <Textarea value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} className="min-h-[110px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2 rounded border p-3">
                <Checkbox checked={mandatory} onCheckedChange={(value) => setMandatory(Boolean(value))} />
                <span>Mark as mandatory session</span>
              </label>
              <label className="flex items-center gap-2 rounded border p-3">
                <Checkbox checked={sendReminder} onCheckedChange={(value) => setSendReminder(Boolean(value))} />
                <span>Send in-app reminder to employee</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={submitSchedule} disabled={loading} className="bg-green-600 hover:bg-green-700">
                {loading ? 'Scheduling...' : 'Schedule Session'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/hr/sessions-review')}>
                Open Review Queue
              </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {warning && <p className="text-sm text-amber-700">{warning}</p>}

            {result && (
              <div className="rounded border border-green-300 bg-green-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-900 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Session scheduled successfully</span>
                </div>
                <p className="text-sm text-green-900">
                  {result.scheduled_count} session(s) created for {targetLabel}. Mandatory: {result.mandatory ? 'yes' : 'no'}.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {result.sessions?.map((session) => (
                    <div key={session.id} className="rounded border bg-white p-3 text-xs">
                      <p className="font-semibold">{session.employee_id}</p>
                      <p className="text-muted-foreground">{new Date(session.scheduled_date).toLocaleString()}</p>
                      <Badge variant="secondary" className="mt-2">{session.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4" />
                Accountability model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Recorded sessions create a time-stamped audit trail that is harder to distort later.</p>
              <p>Employees receive a mandatory reminder before the session so follow-through is visible and measurable.</p>
              <p>HR can review emotion signals, transcripts, and derived scores in the review queue after completion.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Current setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium">Target:</span> {targetMode === 'employee' ? employeeEmail : department}</p>
              <p><span className="font-medium">Mode:</span> {targetMode === 'employee' ? 'Single employee' : 'Department-wide'}</p>
              <p><span className="font-medium">Scheduled:</span> {new Date(scheduledAt).toLocaleString()}</p>
              <p><span className="font-medium">Reminder:</span> {sendReminder ? 'Enabled' : 'Disabled'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareReply className="h-4 w-4" />
                Why this works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Sessions are not anonymous, which reduces casual negativity and encourages considered responses.</p>
              <p>Consent, liveness checks, recording, and HR review make the process closer to a structured HireVue flow.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}