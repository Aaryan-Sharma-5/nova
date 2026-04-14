import { useState } from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAskNova } from "./hooks/useAskNova";

function normalizeNovaResponse(raw: string): { intro: string; items: string[] } {
  const compact = raw
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/([a-zA-Z0-9\)])(\d+\.\s)/g, "$1\n$2")
    .trim();

  const lines = compact
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const numbered = lines.filter((line) => /^\d+\.\s+/.test(line));
  if (numbered.length >= 2) {
    const intro = lines.find((line) => !/^\d+\.\s+/.test(line)) ?? "";
    return {
      intro,
      items: numbered.map((line) => line.replace(/^\d+\.\s+/, "").trim()),
    };
  }

  return {
    intro: compact,
    items: [],
  };
}

export function AskNovaPanel() {
  const [question, setQuestion] = useState("");
  const { response, loading, error, ask } = useAskNova();
  const formatted = useMemo(() => normalizeNovaResponse(response), [response]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(question);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Ask NOVA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about retention, performance, or team sentiment..."
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Streaming..." : "Ask NOVA"}
            </Button>
            {loading && (
              <span className="text-xs text-muted-foreground animate-pulse">
                NOVA is thinking...
              </span>
            )}
          </div>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="rounded-md border border-foreground bg-muted/40 p-4">
          {!response && (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              Ask a question to see streamed insights here.
            </p>
          )}
          {response && (
            <div className="space-y-2 text-sm text-foreground">
              {formatted.intro && <p className="whitespace-pre-wrap">{formatted.intro}</p>}
              {formatted.items.length > 0 && (
                <ol className="list-decimal space-y-1 pl-5">
                  {formatted.items.map((item, index) => (
                    <li key={`${index}-${item.slice(0, 16)}`}>{item}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
