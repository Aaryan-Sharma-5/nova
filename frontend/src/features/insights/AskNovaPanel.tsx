import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAskNova } from "./hooks/useAskNova";

export function AskNovaPanel() {
  const [question, setQuestion] = useState("");
  const { response, loading, error, ask } = useAskNova();

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
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {response || "Ask a question to see streamed insights here."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
