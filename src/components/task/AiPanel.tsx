"use client";

import { useEffect, useRef, useState } from "react";
import type { TaskDTO } from "@/lib/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  taskId: string;
  runId: string;
  /** Show "one more like this" (after a mistake in topic tests / practice). */
  offerSimilar: boolean;
  onSimilar?: (task: TaskDTO) => void;
}

const btn = "rounded-md border border-ink px-3 py-2 text-sm font-semibold hover:bg-paper-2 disabled:opacity-50";

/** Shown after the student has answered: ask about the task, or get a similar one. Every action here calls the AI. */
export function AiPanel({ taskId, runId, offerSimilar, onSimilar }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "chat" | "similar">(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would treat a returned
  // value as the effect's cleanup function and crash ("destroy is not a function").
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  async function ask(question: string) {
    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy("chat");
    setError(null);
    const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, turns: next }) });
    if (!r.ok || !r.body) {
      const body = await r.json().catch(() => ({}));
      setTurns(next);
      setBusy(null);
      return setError(body.error ?? "AI зараз недоступний");
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      setTurns([...next, { role: "assistant", content: text }]);
    }
    setBusy(null);
  }

  async function similar() {
    setBusy("similar");
    setError(null);
    const r = await fetch("/api/ai/similar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, runId }) });
    const body = await r.json();
    setBusy(null);
    if (!r.ok) return setError(body.error);
    onSimilar?.(body.task);
  }

  return (
    <aside className="mt-6 rounded-md border border-grid p-4">
      <h2 className="font-display text-sm font-bold">Помічник</h2>

      {turns.length > 0 && (
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {turns.map((t, i) => (
            <p key={i} className={`whitespace-pre-line rounded-md p-3 text-[15px] ${t.role === "user" ? "ml-8 bg-paper-2" : "mr-4 border border-grid"}`}>
              {t.content || <span className="animate-pulse text-ink-soft">Думаю…</span>}
            </p>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={!!busy} onClick={() => ask("Поясни це завдання інакше, простіше, з прикладом. Чому моя відповідь неправильна?")}>
          Поясни інакше
        </button>
        {offerSimilar && (
          <button type="button" className={`${btn} bg-ink text-on-ink hover:bg-ink`} disabled={!!busy} onClick={similar}>
            {busy === "similar" ? "Підбираю…" : "Ще одне таке завдання"}
          </button>
        )}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) ask(input.trim());
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Спитай про це завдання"
          className="min-w-0 flex-1 rounded-md border border-grid bg-paper px-3 py-2 text-[15px] placeholder:text-ink-soft"
        />
        <button type="submit" className={btn} disabled={!!busy || !input.trim()}>
          Спитати
        </button>
      </form>
    </aside>
  );
}
