import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, CalendarCheck, Lightbulb, Mic, Minus, RefreshCw, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { protectedPostApi } from '@/lib/api';
import {
  dispatchExpandOrgNode,
  dispatchScheduleOneOnOne,
  getAgentContext,
  subscribeOpenAssistant,
} from '@/lib/agentBus';

type ChatRole = 'user' | 'assistant' | 'system';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  agentId?: string;
  actions?: SuggestedAction[];
};

type SuggestedAction = {
  label: string;
  route: string;
  action_type: string;
};

type AgentChatResponse = {
  reply: string;
  agent_id: string;
  suggested_actions: SuggestedAction[];
  data_referenced: Record<string, unknown>;
};

type MicState = 'idle' | 'listening' | 'processing' | 'speaking';

const PAGE_TO_AGENT: Array<{ match: (path: string) => boolean; agentId: string; label: string }> = [
  { match: (p) => p === '/org-health' || p === '/dashboard', agentId: 'workforce_overview_agent', label: 'Workforce Overview Agent' },
  { match: (p) => p.startsWith('/job-board') || p.startsWith('/task-assignments') || p.startsWith('/work-profiles'), agentId: 'talent_pipeline_agent', label: 'Talent Pipeline Agent' },
  { match: (p) => p.startsWith('/employees'), agentId: 'employee_intelligence_agent', label: 'Employee Intelligence Agent' },
  { match: (p) => p.startsWith('/hr/appraisals'), agentId: 'appraisal_agent', label: 'Appraisal Agent' },
  { match: (p) => p.startsWith('/hr/feedback-analyzer'), agentId: 'feedback_agent', label: 'Feedback Agent' },
  { match: (p) => p.startsWith('/departments/heatmap'), agentId: 'dept_insights_agent', label: 'Department Insights Agent' },
];

const FALLBACK_AGENT = { agentId: 'general_nova_agent', label: 'NOVA Assistant' };

const INTRO_SESSION_KEY = 'nova_assistant_introduced';
const TEXT_ONLY_NOTICE = 'Voice input not available in this browser. Please type.';
const MUTE_SESSION_KEY = 'nova_assistant_muted';
const GUIDED_TOUR_PATTERN = /2[- ]?minute tour|guided tour|tour of nova/i;

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  '/org-health': [
    "What's our workforce health score?",
    'Which department needs attention?',
    'How many employees are at risk?',
    'Give me a 2-minute tour of NOVA',
  ],
  '/dashboard': [
    "What's our workforce health score?",
    'Which department needs attention?',
    'How many employees are at risk?',
    'Give me a 2-minute tour of NOVA',
  ],
  '/employees': [
    'Who are our top flight risks?',
    'Which dept has the most burnout?',
    'Tell me about the highest risk employee',
  ],
  '/hr/appraisals': [
    'Summarize this appraisal cycle',
    'Who should be fast-tracked for promotion?',
    'Are there PIP candidates?',
  ],
  '/hr/feedback-analyzer': [
    'What are employees most concerned about?',
    'Which dept has most negative feedback?',
    'How much sarcasm is detected?',
  ],
  '/departments/heatmap': [
    'Which department is performing best?',
    'Which dept has highest burnout?',
    'Compare Engineering and Sales',
  ],
  '/job-board': [
    'How many jobs are awaiting approval?',
    'Which skills are most in demand externally?',
    'Are there any internal candidates for open roles?',
  ],
  '/task-assignments': [
    'What skills are we missing most?',
    'How many open positions need external hires?',
    'Who are the best candidates for pending tasks?',
  ],
  '/work-profiles': [
    'What skills are we missing most?',
    'How many open positions need external hires?',
    'Who are the best candidates for pending tasks?',
  ],
};

function resolveAgent(pathname: string) {
  const match = PAGE_TO_AGENT.find((entry) => entry.match(pathname));
  return match ? { agentId: match.agentId, label: match.label } : FALLBACK_AGENT;
}

function sectionKey(pathname: string): string {
  if (pathname === '/org-health' || pathname === '/dashboard') return 'overview';
  if (pathname.startsWith('/employees')) return 'employees';
  if (pathname.startsWith('/hr/appraisals')) return 'appraisals';
  if (pathname.startsWith('/hr/feedback-analyzer')) return 'feedback';
  if (pathname.startsWith('/departments')) return 'departments';
  return 'other';
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSuggestedQuestions(pathname: string, context: Record<string, unknown>): string[] {
  let basePath = pathname;
  if (pathname.startsWith('/employees')) basePath = '/employees';
  else if (pathname.startsWith('/hr/appraisals')) basePath = '/hr/appraisals';
  else if (pathname.startsWith('/hr/feedback-analyzer')) basePath = '/hr/feedback-analyzer';
  else if (pathname.startsWith('/departments/heatmap')) basePath = '/departments/heatmap';
  else if (pathname.startsWith('/job-board')) basePath = '/job-board';
  else if (pathname.startsWith('/task-assignments')) basePath = '/task-assignments';
  else if (pathname.startsWith('/work-profiles')) basePath = '/work-profiles';

  const seeded = PAGE_SUGGESTIONS[basePath] || [];
  if (basePath === '/employees') {
    const hasSelected = Boolean(
      context.currently_viewed_employee_id || context.employee_id || context.currently_reviewed_employee_id,
    );
    return seeded.filter((q) => (q === 'Tell me about this employee' ? hasSelected : true));
  }
  return seeded;
}

// Narrow typing for the non-standard SpeechRecognition API on window.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceAssistant() {
  const { token, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [micState, setMicState] = useState<MicState>('idle');
  const [conversational, setConversational] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const [introBouncing, setIntroBouncing] = useState(false);
  const [showSuggestedQuestions, setShowSuggestedQuestions] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [agentSwitchToast, setAgentSwitchToast] = useState<string | null>(null);
  const [clearFlash, setClearFlash] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(MUTE_SESSION_KEY) === '1';
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const currentSectionRef = useRef<string>(sectionKey(location.pathname));
  const autoStartRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const tourTimersRef = useRef<number[]>([]);

  const agent = useMemo(() => resolveAgent(location.pathname), [location.pathname]);
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const shortcutLabel = isMac ? '⌘+Space' : 'Ctrl+Space';
  const speechSupported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor();
  const suggestedQuestions = getSuggestedQuestions(
    location.pathname,
    getAgentContext() as Record<string, unknown>,
  );

  // Trim history to last 10 exchanges (20 messages).
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > 20 ? next.slice(next.length - 20) : next;
    });
  }, []);

  // Clear history on cross-section navigation; inject agent-switch notice.
  useEffect(() => {
    const nextSection = sectionKey(location.pathname);
    if (nextSection !== currentSectionRef.current) {
      currentSectionRef.current = nextSection;
      setAgentSwitchToast(agent.label);
      setMessages([]);
      setShowSuggestedQuestions(true);
      const timer = window.setTimeout(() => setAgentSwitchToast(null), 2000);
      return () => window.clearTimeout(timer);
    }
  }, [location.pathname, agent.label]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(MUTE_SESSION_KEY, muted ? '1' : '0');
    if (muted) {
      stopSpeaking();
    }
  }, [muted, stopSpeaking]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.sessionStorage.getItem(INTRO_SESSION_KEY);
    if (seen) return;

    setIntroVisible(true);
    setIntroBouncing(true);
    window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    const timer = window.setTimeout(() => {
      setIntroBouncing(false);
      setIntroVisible(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    setShowSuggestedQuestions(true);
    setIntroVisible(false);
  }, [open, location.pathname]);

  const speak = useCallback(
    (text: string, messageId?: string, onEnd?: () => void) => {
      if (muted || typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) {
        onEnd?.();
        return;
      }
      window.speechSynthesis.cancel();
      setSpeakingMessageId(messageId ?? null);
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-IN';
      utter.rate = 0.95;
      utter.onend = () => {
        setSpeakingMessageId(null);
        setMicState((s) => (s === 'speaking' ? 'idle' : s));
        onEnd?.();
      };
      utter.onerror = () => {
        setSpeakingMessageId(null);
        setMicState((s) => (s === 'speaking' ? 'idle' : s));
        onEnd?.();
      };
      setMicState('speaking');
      window.speechSynthesis.speak(utter);
    },
    [muted],
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const clearTourTimers = useCallback(() => {
    if (tourTimersRef.current.length === 0) return;
    for (const timerId of tourTimersRef.current) {
      window.clearTimeout(timerId);
    }
    tourTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearTourTimers();
    };
  }, [clearTourTimers]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !token) return;

      clearTourTimers();
      setError(null);
      setShowSuggestedQuestions(false);
      appendMessage({ id: newId(), role: 'user', content: trimmed });
      setInputValue('');
      setMicState('processing');

      if (GUIDED_TOUR_PATTERN.test(trimmed)) {
        const intro = 'Perfect. Starting your guided NOVA walkthrough now. I will take you through Org Info, Employees, and Org Tree in sequence.';
        const introId = newId();
        appendMessage({ id: introId, role: 'assistant', content: intro });
        speak(intro, introId);

        const steps = [
          {
            delay: 700,
            to: '/org-health',
            message: 'Step 1 of 3: Org Info. Focus on the workforce score, active alerts, and quick actions for the leadership summary.',
          },
          {
            delay: 3600,
            to: '/employees',
            message: 'Step 2 of 3: Employees. Highlight the top risk clusters and open a showcase employee profile to explain root causes.',
          },
          {
            delay: 6500,
            to: '/employees/org-tree',
            message: 'Step 3 of 3: Org Tree. Use Find and Fit to Screen to show CEO to VP structure, reporting lines, and span of control.',
          },
          {
            delay: 9000,
            to: '/dashboard',
            message: 'Tour complete. You are back on Dashboard and ready for Q&A. Ask me for a deep dive into any metric.',
          },
        ];

        tourTimersRef.current = steps.map((step) =>
          window.setTimeout(() => {
            navigate(step.to);
            appendMessage({ id: newId(), role: 'assistant', content: step.message });
          }, step.delay),
        );

        setMicState('idle');
        return;
      }

      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const response = await protectedPostApi<AgentChatResponse>(
          '/api/agent/chat',
          token,
          {
            message: trimmed,
            agent_id: 'auto',
            conversation_history: history,
            current_page: location.pathname,
            context_data: {
              user_name: user?.full_name,
              user_role: user?.role,
              ...getAgentContext(),
            },
          },
        );

        const assistantMessageId = newId();
        appendMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: response.reply,
          agentId: response.agent_id,
          actions: response.suggested_actions || [],
        });

        speak(response.reply, assistantMessageId, () => {
          if (conversational && speechSupported) {
            // Auto-restart listening for follow-ups.
            autoStartRef.current = true;
            startListening();
          }
        });
      } catch (err) {
        const msg = "I'm having trouble connecting right now. Please try again in a moment.";
        setError(msg);
        appendMessage({
          id: newId(),
          role: 'assistant',
          content: msg,
        });
        setMicState('idle');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, messages, location.pathname, user, conversational, speechSupported, appendMessage, speak, clearTourTimers, navigate],
  );

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(TEXT_ONLY_NOTICE);
      return;
    }
    stopSpeaking();

    try {
      const recognizer = new Ctor();
      recognizer.lang = 'en-IN';
      recognizer.continuous = false;
      recognizer.interimResults = true;
      recognitionRef.current = recognizer;

      let finalTranscript = '';

      recognizer.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        setInputValue(finalTranscript || interim);
      };

      recognizer.onerror = (event: any) => {
        const code = String(event?.error || '').toLowerCase();
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setError('Microphone permission is blocked. Please allow access or type your question.');
        } else {
          setError('Voice input failed. Please try again or type your question.');
        }
        setMicState('idle');
      };

      recognizer.onend = () => {
        recognitionRef.current = null;
        setMicState((s) => (s === 'listening' ? 'idle' : s));
        const finalText = finalTranscript.trim();
        if (finalText) {
          void sendMessage(finalText);
        }
      };

      setMicState('listening');
      recognizer.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start mic');
      setMicState('idle');
    }
  }, [sendMessage, stopSpeaking]);

  const handleMicClick = useCallback(() => {
    if (micState === 'listening') {
      stopListening();
      return;
    }
    if (micState === 'speaking') {
      stopSpeaking();
      setMicState('idle');
      return;
    }
    startListening();
  }, [micState, startListening, stopListening, stopSpeaking]);

  const handleSubmitText = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (inputValue.trim()) {
        void sendMessage(inputValue);
      }
    },
    [inputValue, sendMessage],
  );

  // Keyboard shortcut: Ctrl/Cmd + Space
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.code === 'Space') {
        event.preventDefault();
        setOpen(true);
        if (speechSupported) {
          setTimeout(() => startListening(), 50);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [speechSupported, startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // External "Ask AI" trigger from per-page shortcut buttons.
  useEffect(() => {
    return subscribeOpenAssistant(({ suggestedQuestion, autoStart }) => {
      setOpen(true);
      if (suggestedQuestion) {
        setInputValue(suggestedQuestion);
      }
      if (autoStart && speechSupported) {
        setTimeout(() => startListening(), 80);
      }
    });
  }, [speechSupported, startListening]);

  const handleAction = useCallback(
    (action: SuggestedAction) => {
      if (action.action_type === 'navigate') {
        navigate(action.route);
        return;
      }
      if (action.action_type === 'expand-node') {
        navigate('/employees');
        window.setTimeout(() => {
          dispatchExpandOrgNode(action.route);
        }, 140);
        return;
      }
      if (action.action_type === 'schedule-1on1') {
        dispatchScheduleOneOnOne(action.route);
      }
    },
    [navigate],
  );

  if (!isAuthenticated) return null;

  const micLabel =
    micState === 'listening'
      ? 'Listening...'
      : micState === 'processing'
      ? 'Processing...'
      : micState === 'speaking'
      ? 'Speaking...'
      : 'Click to speak';
  const isDarkTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <>
      {!open && (
        <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-2">
          {introVisible && (
            <div className="max-w-[260px] rounded-lg border-2 border-foreground bg-white px-3 py-2 text-xs shadow-[3px_3px_0px_#000]">
              Hi! I'm NOVA Assistant. Click to ask me anything about your workforce data.
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={`Ask NOVA Assistant (${shortcutLabel})`}
            aria-label="Open NOVA Assistant"
            className={`nova-voice-fab relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground shadow-[2px_2px_0px_#000] transition-transform hover:-translate-y-0.5 ${
              introBouncing ? 'nova-intro-bounce' : ''
            }`}
            style={{ backgroundColor: isDarkTheme ? '#3b82f6' : '#F5C518' }}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{ animation: 'nova-voice-pulse 2.4s ease-out infinite' }}
            />
            <Mic className="h-6 w-6" style={{ color: isDarkTheme ? '#ffffff' : '#111827' }} />
            <style>{`
              @keyframes nova-voice-pulse {
                0% { box-shadow: 0 0 0 0 rgba(245, 197, 24, 0.55); }
                70% { box-shadow: 0 0 0 16px rgba(245, 197, 24, 0); }
                100% { box-shadow: 0 0 0 0 rgba(245, 197, 24, 0); }
              }
              @keyframes nova-intro-bounce {
                0%, 100% { transform: translateY(0); }
                25% { transform: translateY(-6px); }
                50% { transform: translateY(0); }
                75% { transform: translateY(-3px); }
              }
              .nova-intro-bounce {
                animation: nova-intro-bounce 0.8s ease-in-out 0s 4;
              }
            `}</style>
          </button>
        </div>
      )}

      {open && (
        <div
          className="fixed bottom-6 right-6 z-[1000] flex flex-col border"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff',
            color: 'var(--text-primary)',
            width: 360,
            height: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div className="h-1 w-full" style={{ backgroundColor: 'var(--accent-primary)' }} />
          <header className="flex items-center gap-2 border-b-2 border-foreground px-3 py-2" style={{ backgroundColor: isDarkTheme ? '#3b82f6' : '#F5C518' }}>
            <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground" style={{ backgroundColor: isDarkTheme ? '#0f172a' : '#111827' }}>
              <Bot className="h-4 w-4" style={{ color: isDarkTheme ? '#f1f5f9' : '#F5C518' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">NOVA Assistant</p>
              <p className="text-[10px] uppercase tracking-wider text-black/70 truncate">
                {agent.label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMuted((v) => !v)}
              title={muted ? 'Unmute voice' : 'Mute voice'}
              className="mr-1 flex h-7 w-7 items-center justify-center border-2 border-foreground"
              style={{ backgroundColor: isDarkTheme ? '#334155' : '#ffffff', color: isDarkTheme ? '#f1f5f9' : '#111827' }}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize"
              className="flex h-7 w-7 items-center justify-center border-2 border-foreground"
              style={{ backgroundColor: isDarkTheme ? '#334155' : '#ffffff', color: isDarkTheme ? '#f1f5f9' : '#111827' }}
            >
              <Minus className="h-4 w-4" />
            </button>
          </header>

          <div
            className={`flex-1 overflow-y-auto px-3 py-3 transition-colors duration-500 ${clearFlash ? 'bg-yellow-50' : ''}`}
            style={{ backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff' }}
          >
            {agentSwitchToast && (
              <div className="mx-auto mb-2 w-fit rounded-full bg-gray-100 px-3 py-1 text-[11px] italic text-gray-700 nova-agent-switch-pill">
                <RefreshCw size={11} className="inline-block mr-1 align-middle" />{agentSwitchToast}
              </div>
            )}
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">
                Ask anything about this page or the NOVA platform.
                <br />
                Press mic or type your question.
              </div>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((m) => {
                if (m.role === 'system') {
                  return null;
                }
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-foreground bg-white">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="flex max-w-[78%] flex-col gap-1">
                      <div
                        className="px-3 py-2 text-xs leading-snug whitespace-pre-wrap border rounded-[16px_16px_16px_4px]"
                        style={
                          isUser
                            ? {
                                backgroundColor: isDarkTheme ? '#3b82f6' : '#F5C518',
                                color: isDarkTheme ? '#ffffff' : '#111827',
                                borderColor: isDarkTheme ? '#3b82f6' : '#F5C518',
                                borderRadius: '16px 16px 4px 16px',
                              }
                            : {
                                backgroundColor: isDarkTheme ? '#334155' : '#f9fafb',
                                color: isDarkTheme ? '#f1f5f9' : '#111111',
                                borderColor: isDarkTheme ? '#475569' : '#e5e7eb',
                                borderRadius: '16px 16px 16px 4px',
                              }
                        }
                      >
                        {m.content}
                        {!isUser && speakingMessageId === m.id && micState === 'speaking' && (
                          <span className="mt-2 inline-flex items-end gap-1" aria-label="Speaking waveform">
                            {[0, 1, 2, 3, 4].map((bar) => (
                              <span
                                key={`${m.id}-bar-${bar}`}
                                className="nova-wave-bar"
                                style={{ animationDelay: `${bar * 0.12}s` }}
                              />
                            ))}
                          </span>
                        )}
                      </div>
                      {!isUser && m.actions && m.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.actions.map((action, idx) => {
                            const isSchedule = action.action_type === 'schedule-1on1';
                            return (
                              <button
                                key={`${m.id}-act-${idx}`}
                                type="button"
                                onClick={() => handleAction(action)}
                                className={`inline-flex items-center gap-1 border-2 border-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-[2px_2px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] ${
                                  isSchedule ? 'bg-[#F5C518] text-black' : 'bg-white text-black'
                                }`}
                              >
                                {isSchedule && <CalendarCheck className="h-3 w-3" />}
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {micState === 'processing' && (
                <div className="flex gap-2 justify-start">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-foreground bg-white">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="border-2 border-foreground bg-white px-2.5 py-1.5 text-xs">
                    <span className="inline-flex gap-1">
                      <span className="nova-dot" />
                      <span className="nova-dot" style={{ animationDelay: '0.2s' }} />
                      <span className="nova-dot" style={{ animationDelay: '0.4s' }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <style>{`
              .nova-dot {
                width: 6px;
                height: 6px;
                border-radius: 9999px;
                background: currentColor;
                display: inline-block;
                animation: nova-dot-bounce 1s infinite ease-in-out;
              }
              @keyframes nova-dot-bounce {
                0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
                40% { opacity: 1; transform: translateY(-3px); }
              }
              .nova-wave-bar {
                width: 3px;
                height: 4px;
                background: #F5C518;
                display: inline-block;
                transform-origin: bottom;
              }
              .nova-wave-bar:nth-child(1) { animation: nova-wave-1 0.6s ease-in-out infinite; }
              .nova-wave-bar:nth-child(2) { animation: nova-wave-2 0.8s ease-in-out infinite; animation-delay: 0.1s; }
              .nova-wave-bar:nth-child(3) { animation: nova-wave-3 0.5s ease-in-out infinite; animation-delay: 0.2s; }
              .nova-wave-bar:nth-child(4) { animation: nova-wave-4 0.7s ease-in-out infinite; animation-delay: 0.15s; }
              .nova-wave-bar:nth-child(5) { animation: nova-wave-5 0.9s ease-in-out infinite; animation-delay: 0.05s; }
              @keyframes nova-wave-1 {
                0%, 100% { height: 4px; }
                50% { height: 14px; }
              }
              @keyframes nova-wave-2 {
                0%, 100% { height: 4px; }
                50% { height: 20px; }
              }
              @keyframes nova-wave-3 {
                0%, 100% { height: 4px; }
                50% { height: 24px; }
              }
              @keyframes nova-wave-4 {
                0%, 100% { height: 4px; }
                50% { height: 18px; }
              }
              @keyframes nova-wave-5 {
                0%, 100% { height: 4px; }
                50% { height: 12px; }
              }
              .nova-agent-switch-pill {
                animation: nova-agent-pill 2s ease-in-out;
              }
              @keyframes nova-agent-pill {
                0% { opacity: 0; transform: translateY(4px); }
                15%, 75% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-2px); }
              }
            `}</style>
          </div>

          {error && (
            <div className="px-3 py-1 text-[11px] text-red-700 bg-red-50 border-t border-red-200 flex items-center justify-between gap-2">
              <span className="truncate">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmitText}
            className="border-t-2 border-foreground bg-card px-3 py-2 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your question..."
                className="flex-1 border-2 border-foreground bg-white px-2 py-1 text-xs focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || micState === 'processing'}
                className="flex h-8 w-8 items-center justify-center border-2 border-foreground disabled:opacity-40"
                style={{ backgroundColor: isDarkTheme ? '#3b82f6' : '#F5C518', color: isDarkTheme ? '#ffffff' : '#111827' }}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            {showSuggestedQuestions && suggestedQuestions.length > 0 && (
              <div className="flex flex-col gap-2">
                {suggestedQuestions.slice(0, 3).map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setInputValue(question);
                      void sendMessage(question);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-[12px] text-gray-600 hover:bg-[#fef9c3]"
                  >
                    <Lightbulb className="h-3.5 w-3.5 text-[#d4a400]" />
                    {question}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-start">
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setMessages([]);
                  setShowSuggestedQuestions(true);
                  setClearFlash(true);
                  window.setTimeout(() => setClearFlash(false), 500);
                }}
              >
                Clear chat
              </button>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={handleMicClick}
                disabled={!speechSupported}
                title={speechSupported ? `Shortcut: ${shortcutLabel}` : 'Speech not supported'}
                className={`relative flex h-10 w-10 items-center justify-center border-2 border-foreground transition-colors ${
                  micState === 'listening'
                    ? 'bg-red-500 text-white'
                    : micState === 'speaking'
                    ? 'text-white'
                    : micState === 'processing'
                    ? 'bg-gray-300 text-black'
                    : 'text-black'
                } ${!speechSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{
                  backgroundColor:
                    micState === 'speaking'
                      ? '#3b82f6'
                      : micState === 'idle'
                      ? isDarkTheme
                        ? '#3b82f6'
                        : '#F5C518'
                      : undefined,
                  color:
                    micState === 'speaking' || (micState === 'idle' && isDarkTheme)
                      ? '#ffffff'
                      : undefined,
                }}
              >
                {micState === 'speaking' ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {micState === 'listening' && (
                  <span className="absolute inset-0 rounded-none ring-2 ring-red-400 animate-pulse" />
                )}
              </button>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {micLabel}
              </p>
              {!speechSupported && (
                <p className="text-[10px] text-amber-700 font-medium">{TEXT_ONLY_NOTICE}</p>
              )}
              <p className="text-[9px] text-muted-foreground/70">
                Press mic or type your question · {shortcutLabel}
              </p>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export default VoiceAssistant;
