import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { protectedGetApi } from '@/lib/api';

const QUESTIONS = [
  'Walk us through how your last two weeks at work have felt overall.',
  'Describe your working relationship with your immediate manager.',
  "What's one thing about your team dynamic you'd want leadership to know?",
  'Where do you see gaps in your own growth or the support you receive?',
  "Is there anything else you'd like HR to be aware of?",
];

type Stage = 'consent' | 'check' | 'session' | 'submit';

type FeedbackSession = {
  id: string;
  scheduled_date: string;
  status: 'scheduled' | 'completed' | 'skipped';
  transcript?: string;
};

export default function FeedbackSessionPage() {
  const { token } = useAuth();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [stage, setStage] = useState<Stage>('consent');
  const [consentChecked, setConsentChecked] = useState(false);
  const [declinedMessage, setDeclinedMessage] = useState('');
  const [sessions, setSessions] = useState<FeedbackSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [micLevel, setMicLevel] = useState(0);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessError, setLivenessError] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timer, setTimer] = useState(90);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlobs, setRecordedBlobs] = useState<Record<number, Blob>>({});
  const [reRecordUsed, setReRecordUsed] = useState<Record<number, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const currentQuestion = QUESTIONS[questionIndex];

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const response = await protectedGetApi<{ sessions: FeedbackSession[] }>('/api/feedback/sessions/my', token);
      const allSessions = response.sessions || [];
      setSessions(allSessions);
      const scheduled = allSessions.find((s) => s.status === 'scheduled' || s.status === 'in_progress');
      const byRoute = sessionId ? allSessions.find((s) => s.id === sessionId) : null;
      setActiveSessionId(byRoute?.id ?? scheduled?.id ?? allSessions?.[0]?.id ?? null);
    };
    void load();
  }, [token]);

  useEffect(() => {
    if (!isRecording) return;
    if (timer <= 0) {
      stopRecording();
      return;
    }

    const id = window.setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [isRecording, timer]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const postJson = async <T,>(path: string, payload: unknown): Promise<T> => {
    if (!token) {
      throw new Error('Sign in required');
    }
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Request failed (${response.status})`);
    }
    return (await response.json()) as T;
  };

  const beginWithConsent = async () => {
    if (!activeSessionId || !consentChecked) return;
    await postJson(`/api/feedback/sessions/${activeSessionId}/consent`, {
      consented: true,
      consent_version: 'v1.0-dpdp-2023',
    });
    setStage('check');
    await setupMedia();
  };

  const declineConsent = async () => {
    if (!activeSessionId) return;
    await postJson(`/api/feedback/sessions/${activeSessionId}/consent`, {
      consented: false,
      consent_version: 'v1.0-dpdp-2023',
    });
    setDeclinedMessage('Session marked as declined and your manager will be notified');
  };

  const setupMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const meter = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / Math.max(1, dataArray.length);
      setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
      if (stage === 'check') {
        requestAnimationFrame(meter);
      }
    };
    meter();
  };

  const runLivenessCheck = async () => {
    setLivenessError('');
    try {
      const existing = document.querySelector('script[data-face-api]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
        script.async = true;
        script.setAttribute('data-face-api', 'true');
        document.body.appendChild(script);
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Unable to load face-api.js'));
        });
      }

      const faceapi = (window as any).faceapi;
      if (!faceapi || !videoRef.current) {
        throw new Error('face-api unavailable');
      }

      await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights');

      const detections = [] as Array<{ x: number; y: number }>;
      for (let i = 0; i < 4; i += 1) {
        const d = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions());
        if (d?.box) {
          detections.push({ x: d.box.x + d.box.width / 2, y: d.box.y + d.box.height / 2 });
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (detections.length < 2) {
        throw new Error('Face not reliably detected. Please adjust lighting and camera angle.');
      }

      const movement = Math.max(
        ...detections.slice(1).map((p, idx) => {
          const prev = detections[idx];
          return Math.hypot(p.x - prev.x, p.y - prev.y);
        }),
      );

      if (movement < 6) {
        throw new Error('Liveness check failed. Blink or turn your head slightly, then retry.');
      }

      setLivenessPassed(true);
    } catch (err) {
      setLivenessPassed(false);
      setLivenessError(err instanceof Error ? err.message : 'Liveness check failed');
    }
  };

  const startSession = () => {
    setStage('session');
    setQuestionIndex(0);
    setTimer(90);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlobs((prev) => ({ ...prev, [questionIndex]: blob }));
      setIsRecording(false);
      setTimer(90);
    };

    recorder.start(1000);
    setIsRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const reRecord = () => {
    if (reRecordUsed[questionIndex]) return;
    setReRecordUsed((prev) => ({ ...prev, [questionIndex]: true }));
    setRecordedBlobs((prev) => {
      const next = { ...prev };
      delete next[questionIndex];
      return next;
    });
  };

  const goNextQuestion = () => {
    if (!recordedBlobs[questionIndex]) return;
    if (questionIndex === QUESTIONS.length - 1) {
      setStage('submit');
      return;
    }
    setQuestionIndex((q) => q + 1);
    setTimer(90);
  };

  const uploadAll = async () => {
    if (!token || !activeSessionId) return;

    setLoading(true);
    try {
      const total = QUESTIONS.length;
      const orderedBlobs: Blob[] = [];
      for (let i = 0; i < total; i += 1) {
        const blob = recordedBlobs[i];
        if (!blob) {
          throw new Error(`Missing recording for question ${i + 1}`);
        }
        orderedBlobs.push(blob);
        setUploadProgress(Math.round(((i + 1) / total) * 70));
      }

      const merged = new Blob(orderedBlobs, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video_file', new File([merged], `session-${activeSessionId}.webm`, { type: 'video/webm' }));

      const uploadRes = await fetch(`/api/feedback/sessions/${activeSessionId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        throw new Error('Session upload failed');
      }

      setUploadProgress(90);

      await postJson(`/api/feedback/sessions/${activeSessionId}/process`, {});
      setUploadProgress(100);
      setSubmitted(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const refreshMySessions = async () => {
    if (!token) return;
    const response = await protectedGetApi<{ sessions: FeedbackSession[] }>('/api/feedback/sessions/my', token);
    setSessions(response.sessions || []);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mandatory AI Feedback Session</h1>
        <p className="text-sm text-muted-foreground">HireVue-style recorded feedback flow for employee wellbeing and organizational analytics.</p>
      </div>

      {declinedMessage && (
        <Alert variant="destructive">
          <AlertTitle>Session Declined</AlertTitle>
          <AlertDescription>{declinedMessage}</AlertDescription>
        </Alert>
      )}

      {stage === 'consent' && (
        <Card>
          <CardHeader>
            <CardTitle>Consent & Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>
              This mandatory session records video and audio responses for HR review. Recording retained for 90 days, accessible to HR only.
            </p>

            <div className="rounded bg-blue-50 border border-blue-200 p-3 space-y-2 text-xs">
              <p className="font-medium text-blue-900">Your privacy is protected:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Responses are confidential and seen by HR only</li>
                <li>Recordings deleted after 90 days</li>
                <li>You can request transcript or data deletion anytime</li>
                <li>Session is a safe space to share your honest perspective</li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground italic">
              In accordance with India's Digital Personal Data Protection Act 2023, consent is logged with timestamp and IP address.
            </p>

            <div className="flex items-center gap-2">
              <Checkbox id="consent" checked={consentChecked} onCheckedChange={(v) => setConsentChecked(Boolean(v))} />
              <Label htmlFor="consent">I understand this session is recorded and my responses are on record</Label>
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={beginWithConsent} disabled={!consentChecked || !activeSessionId} className="bg-green-600 hover:bg-green-700">
                I Consent &amp; Begin Recording
              </Button>
              <Button variant="outline" onClick={declineConsent} disabled={!activeSessionId}>
                Decline &amp; Skip Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'check' && (
        <Card>
          <CardHeader>
            <CardTitle>Camera / Mic Check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <video ref={videoRef} className="w-full max-w-2xl rounded border" muted autoPlay playsInline />
            <div>
              <p className="text-sm mb-1">Microphone level</p>
              <Progress value={micLevel} />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={runLivenessCheck}>Run Liveness Check</Button>
              {livenessPassed ? <Badge>Live person confirmed</Badge> : <Badge variant="secondary">Not verified</Badge>}
            </div>
            {livenessError && <p className="text-sm text-red-600">{livenessError}</p>}
            <Button onClick={startSession} disabled={!livenessPassed} className="bg-green-600 hover:bg-green-700">
              Camera &amp; Mic verified - Start Session
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === 'session' && (
        <Card>
          <CardHeader>
            <CardTitle>Feedback Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <video ref={videoRef} className="w-full rounded border" muted autoPlay playsInline />
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-muted-foreground'}`}></span>
                  <span>{isRecording ? 'Recording in progress' : 'Ready to record'}</span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Question {questionIndex + 1} of {QUESTIONS.length}</p>
                <p className="font-medium">{currentQuestion}</p>
                <p className="text-sm text-muted-foreground">
                  Take a moment to reflect on your honest response. No right or wrong answers and we value your perspective.
                </p>
                <p className="text-sm">
                  Time remaining: <span className={`font-semibold ${timer < 20 ? 'text-red-600' : 'text-foreground'}`}>{timer}s</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {!isRecording && <Button onClick={startRecording}>Start Recording</Button>}
                  {isRecording && <Button variant="destructive" onClick={stopRecording}>Stop</Button>}
                  <Button variant="outline" onClick={reRecord} disabled={!recordedBlobs[questionIndex] || reRecordUsed[questionIndex]}>Re-record Once</Button>
                  <Button onClick={goNextQuestion} disabled={!recordedBlobs[questionIndex]}>Next</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'submit' && (
        <Card>
          <CardHeader>
            <CardTitle>Submission & Confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!submitted ? (
              <>
                <Button onClick={uploadAll} disabled={loading}>{loading ? 'Submitting...' : 'Submit Session'}</Button>
                <Progress value={uploadProgress} />
              </>
            ) : (
              <>
                <Alert>
                  <AlertTitle>Your session has been submitted.</AlertTitle>
                  <AlertDescription>Your feedback has been securely uploaded. HR will conduct a careful review and may reach out if they need clarification.</AlertDescription>
                </Alert>
                <p className="text-sm">Session ID: <span className="font-mono">{activeSessionId}</span></p>
                <div className="rounded bg-amber-50 border border-amber-200 p-3 space-y-1 text-xs text-amber-900">
                  <p className="font-medium">Next Steps:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>HR review timeline: 3-5 business days</li>
                    <li>You'll see status updates in your dashboard</li>
                    <li>Check "Feedback Sessions" tab in Employee Portal for updates</li>
                    <li>Questions? Contact HR at <span className="font-semibold">hr@company.com</span></li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={refreshMySessions}>Refresh Status</Button>
                  <Button
                    variant="secondary"
                    disabled={!activeSession?.transcript}
                    onClick={() => {
                      const blob = new Blob([activeSession?.transcript || 'Transcript not ready'], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `session-${activeSessionId}-transcript.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download your transcript
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
