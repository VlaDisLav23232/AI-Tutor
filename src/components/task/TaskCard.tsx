"use client";

import { useEffect, useRef, useState } from "react";
import type { Answer, GoalProgress, TaskDTO, TopicDelta } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { AiPanel } from "./AiPanel";
import { Feedback } from "./Feedback";
import { ReportButton } from "./ReportButton";
import { SaveButtons } from "./SaveButtons";
import { TopicProgress } from "./TopicProgress";
import { isComplete, TaskView, type Response } from "./TaskView";

export interface CheckResult {
  correct: boolean;
  points: number;
  maxPoints: number;
  answer: Answer;
  topic?: TopicDelta | null;
  goal?: GoalProgress | null;
}

interface Props {
  task: TaskDTO;
  runId: string;
  /** Immediate feedback (topic, practice, saved) vs. saved-only (diagnostic, exam). */
  instant: boolean;
  initialResponse?: Response;
  initialResult?: CheckResult | null;
  onAnswered: (taskId: string, response: Response, result: CheckResult | null) => void;
  onSimilar?: (task: TaskDTO) => void;
  /** Small label above the task (topic, why it was picked). */
  tag?: React.ReactNode;
  /** The action in the bottom bar once the task is answered (e.g. "Далі"). */
  next?: { label: string; onClick: () => void; disabled?: boolean } | null;
}

const barButton = "w-full rounded-xl bg-ink px-6 py-3.5 font-display text-sm font-bold text-on-ink transition-opacity disabled:opacity-35 md:w-auto";

export function TaskCard({ task, runId, instant, initialResponse = null, initialResult = null, onAnswered, onSimilar, tag, next }: Props) {
  const [value, setValue] = useState<Response>(initialResponse);
  const [result, setResult] = useState<CheckResult | null>(initialResult);
  const [saved, setSaved] = useState(initialResponse !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anim, setAnim] = useState<"" | "shake" | "glow-good">("");
  const [goalReached, setGoalReached] = useState(false);
  const started = useRef(0);

  // Callers key this component by task id, so state starts fresh for every task.
  useEffect(() => {
    started.current = Date.now();
  }, []);

  async function submit() {
    if (!isComplete(task, value)) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, taskId: task.id, response: value, msSpent: Date.now() - started.current }),
    });
    const body = await r.json();
    setBusy(false);
    if (!r.ok) return setError(body.error ?? "Не вдалося зберегти відповідь");
    const res: CheckResult | null = instant ? body : null;
    setResult(res);
    setSaved(true);
    if (res) setAnim(res.correct ? "glow-good" : "shake");
    if (body.goal?.streakExtended) setGoalReached(true);
    onAnswered(task.id, value, res);
  }

  return (
    <article>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-ink-soft">
          {tag}
          {task.source === "generated" && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs">AI-згенеровано</span>}
        </div>
        <SaveButtons taskId={task.id} initial={task.saved} />
      </div>

      <div className={anim} onAnimationEnd={() => setAnim("")}>
        <TaskView task={task} value={value} onChange={setValue} locked={saved} answer={result?.answer} />
      </div>

      {/* AI-made tasks can have a wrong key or two right options; once answered, the student can tell. */}
      {task.source === "generated" && saved && (
        <div className="mt-3 flex justify-end">
          <ReportButton taskId={task.id} kind="task" />
        </div>
      )}

      {saved && !instant &&<p className="rise mt-4 text-sm text-ink-soft">Відповідь збережено. Результат — після завершення.</p>}
      {error && <p className="mt-3 text-bad">{error}</p>}

      {goalReached && (
        <p className="rise mt-4 flex items-center gap-2 rounded-2xl bg-flame/15 p-3 font-semibold text-flame">
          <Icon name="flame" className="flicker size-6" filled /> Ціль дня виконано — серія продовжується!
        </p>
      )}

      {result && <Feedback taskId={task.id} response={value} answer={result.answer} points={result.points} maxPoints={result.maxPoints} />}
      {result?.topic && <TopicProgress topic={result.topic} />}
      {instant && saved && <AiPanel taskId={task.id} runId={runId} offerSimilar={!!result && !result.correct} onSimilar={onSimilar} />}

      {/* Bottom action bar: stays on screen while the explanation is read, so «Наступне» never needs a scroll. */}
      {(!saved || next) && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-grid bg-paper/95 px-4 py-3 backdrop-blur">
          {!saved ? (
            <button type="button" disabled={busy || !isComplete(task, value)} onClick={submit} className={barButton}>
              {busy ? "Перевіряю…" : instant ? "Перевірити" : "Зберегти відповідь"}
            </button>
          ) : (
            next && (
              <button type="button" disabled={next.disabled} onClick={next.onClick} className={barButton}>
                {next.label}
              </button>
            )
          )}
        </div>
      )}
    </article>
  );
}
