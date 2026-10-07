"use client";

import { useEffect, useState } from "react";
import { Marked } from "@/components/Marked";
import type { Answer, ExplanationContent } from "@/lib/types";
import type { Response } from "./TaskView";
import { ReportButton } from "./ReportButton";
import { Icon } from "@/components/Icon";

interface Props {
  taskId: string;
  response: Response;
  answer: Answer;
  points: number;
  maxPoints: number;
}

export function Feedback({ taskId, response, answer, points, maxPoints }: Props) {
  const [data, setData] = useState<{ content: ExplanationContent; status: string } | null>(null);
  // loading → (ready | missing); missing → generating → ready. AI runs only on an explicit click.
  const [phase, setPhase] = useState<"loading" | "missing" | "generating" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/explanations/${taskId}`)
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setData(body);
          setPhase("ready");
        } else if (r.status === 404) setPhase("missing");
        else setError(body.error ?? "Пояснення недоступне");
      })
      .catch(() => !cancelled && setError("Не вдалося завантажити пояснення"));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function generate() {
    setPhase("generating");
    setError(null);
    const r = await fetch(`/api/explanations/${taskId}`, { method: "POST" });
    const body = await r.json();
    if (r.ok) {
      setData(body);
      setPhase("ready");
    } else {
      setPhase("missing");
      setError(body.error ?? "Не вдалося пояснити");
    }
  }

  const correct = points === maxPoints;
  const chosen = typeof response === "string" ? response : null;
  const content = data?.content;

  return (
    <section aria-live="polite" className={`rise mt-6 rounded-2xl p-4 ${correct ? "bg-good/10" : "bg-bad/10"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${correct ? "bg-good" : "bg-bad"}`}>
          <Icon name={correct ? "check" : "x"} className="size-5" />
        </span>
        <div>
          <p className={`font-display text-lg font-bold ${correct ? "text-good" : "text-bad"}`}>
            {correct ? "Правильно!" : maxPoints > 1 && points > 0 ? `Частково: ${points} з ${maxPoints}` : "Не зовсім"}
          </p>
          {!correct && typeof answer === "string" && <p className="text-[15px]">Правильна відповідь — {answer}.</p>}
        </div>
      </div>

      {phase === "missing" && (
        <button
          type="button"
          onClick={generate}
          className="mt-3 rounded-md border border-ink px-3 py-2 text-sm font-semibold hover:bg-paper-2"
        >
          Пояснити (AI)
        </button>
      )}
      {phase === "generating" && <p className="mt-3 animate-pulse text-ink-soft">Готуємо пояснення…</p>}
      {error && <p className="mt-3 text-ink-soft">{error}</p>}

      {content && (
        <div className="mt-3 space-y-3 text-[16px]">
          {/* The rule comes first; everything below applies it to the options. */}
          <div className="rounded-xl bg-card p-3 shadow-[0_0_0_1px_var(--grid)]">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <Icon name="book" className="size-4" /> Правило
            </p>
            <p className="mt-1">
              <Marked text={content.rule} />
            </p>
          </div>
          {chosen && chosen !== answer && content.whyWrong[chosen] && (
            <p className="rounded-xl bg-bad/10 p-3">
              <strong>Чому не {chosen}: </strong>
              <Marked text={content.whyWrong[chosen]} />
            </p>
          )}
          <p className="rounded-xl bg-good/10 p-3">
            <strong>Чому {typeof answer === "string" ? answer : "так"}: </strong>
            <Marked text={content.whyCorrect} />
          </p>
          {content.perItem && (
            <ul className="space-y-1">
              {Object.entries(content.perItem).map(([n, why]) => {
                const resp = (response ?? {}) as Record<string, string>;
                const key = (answer as Record<string, string>)[n];
                const ok = resp[n] === key;
                return (
                  <li key={n} className={ok ? "" : "rounded bg-bad/10 px-2 py-1"}>
                    <strong>
                      {n} → {key}
                    </strong>
                    {!ok && resp[n] && <span className="text-bad"> (у тебе {resp[n]})</span>}: <Marked text={why} />
                  </li>
                );
              })}
            </ul>
          )}
          {content.tip && (
            <p className="flex gap-2 rounded-xl bg-marker/30 p-3">
              <Icon name="bolt" className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>Порада: </strong>
                <Marked text={content.tip} />
              </span>
            </p>
          )}
          {Object.keys(content.whyWrong).some((l) => l !== chosen) && (
            <details className="text-ink-soft">
              <summary className="cursor-pointer">Чому не підходять інші варіанти</summary>
              <ul className="mt-2 space-y-1">
                {Object.entries(content.whyWrong)
                  .filter(([l]) => l !== chosen)
                  .map(([l, why]) => (
                    <li key={l}>
                      <strong>{l}:</strong> <Marked text={why} />
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            {data.status === "needs_review" && <span>Пояснення ще перевіряється.</span>}
            <ReportButton taskId={taskId} kind="explanation" />
          </div>
        </div>
      )}
    </section>
  );
}
