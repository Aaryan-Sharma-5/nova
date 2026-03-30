import { useCallback, useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export function useAskNova() {
  const { token } = useAuth();
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestUrl = useMemo(
    () => (API_BASE_URL ? `${API_BASE_URL}/api/ai/ask` : "/api/ai/ask"),
    [],
  );

  const ask = useCallback(async (question: string) => {
    if (!token) {
      setError("You must be signed in to ask NOVA.");
      return;
    }
    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    setResponse("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(requestUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const payload = await res.json();
          if (payload?.detail) {
            message = String(payload.detail);
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      if (!res.body) {
        throw new Error("Streaming response not available.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              setResponse((prev) => prev + line.replace("data: ", ""));
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach NOVA.");
    } finally {
      setLoading(false);
    }
  }, [requestUrl, token]);

  return { response, loading, error, ask };
}
