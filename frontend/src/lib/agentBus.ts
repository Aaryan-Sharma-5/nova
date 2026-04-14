// Lightweight pub/sub for the NOVA voice assistant.
// Pages publish page-state context here; the VoiceAssistant reads it on send
// and listens for "open" requests from per-page "Ask AI" shortcuts.

export type AgentContext = Record<string, unknown>;

type OpenPayload = {
  suggestedQuestion?: string;
  autoStart?: boolean;
};

let context: AgentContext = {};
const openListeners = new Set<(p: OpenPayload) => void>();

export function setAgentContext(next: AgentContext): void {
  context = { ...next };
}

export function patchAgentContext(patch: AgentContext): void {
  context = { ...context, ...patch };
}

export function clearAgentContext(): void {
  context = {};
}

export function getAgentContext(): AgentContext {
  return context;
}

export function requestOpenAssistant(payload: OpenPayload = {}): void {
  openListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // listener failures should not break the caller
    }
  });
}

export function subscribeOpenAssistant(fn: (p: OpenPayload) => void): () => void {
  openListeners.add(fn);
  return () => {
    openListeners.delete(fn);
  };
}

// Schedule-1:1 dispatch — pages with a schedule modal can listen for this.
export type ScheduleOneOnOneDetail = { employeeId: string };

export function dispatchScheduleOneOnOne(employeeId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ScheduleOneOnOneDetail>('nova:schedule-1on1', {
      detail: { employeeId },
    }),
  );
}
