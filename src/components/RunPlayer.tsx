"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import type { RunMode, TaskDTO } from "@/lib/types";
import { TaskCard, type CheckResult } from "./task/TaskCard";
import type { Response } from "./task/TaskView";

interface Props {
  runId: string;
  mode: RunMode;
  title: string;
  tasks: TaskDTO[];
  answered: Record<string, { response: Response; result: CheckResult | null }>;
  deadline: number | null; // epoch ms
}

function Countdown({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => deadline - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = deadline - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, onExpire]);
  const s = Math.max(0, Math.floor(left / 1000));
  const low = s < 120;
  return (
    <span className={`font-display tabular-nums ${low ? "text-bad" : ""}`} aria-label="Залишилось часу">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function RunPlayer({ runId, mode, title, tasks: initialTasks, answered: initialAnswered, deadline }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [answered, setAnswered] = useState(initialAnswered);
  const [index, setIndex] = useState(() => {
    const first = initialTasks.findIndex((t) => !initialAnswered[t.id]);
    return first === -1 ? 0 : first;
  });
  const [finishing, setFinishing] = useState(false);
  const instant = mode === "topic" || mode === "practice" || mode === "saved";
  const task = tasks[index];
  const doneCount = useMemo(() => tasks.filter((t) => answered[t.id]).length, [tasks, answered]);

  const finish = useCallback(async () => {
    setFinishing(true);
    await fetch(`/api/runs/${runId}/finish`, { method: "POST" });
    router.push(`/run/${runId}/result`);
  }, [runId, router]);

  function finishWithConfirm() {
    const left = tasks.length - doneCount;
    if (left > 0 && !window.confirm(`Ще ${left} без відповіді. Завершити?`)) return;
    finish();
  }

  function next() {
    const after = tasks.findIndex((t, i) => i > index && !answered[t.id]);
    const anyLeft = tasks.findIndex((t) => !answered[t.id]);
    if (after !== -1) setIndex(after);
    else if (anyLeft !== -1) setIndex(anyLeft);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-grid bg-paper/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="grid size-9 place-items-center rounded-xl hover:bg-paper-2" aria-label="Вийти (прогрес збережено)" title="Вийти (прогрес збережено)">
            <Icon name="x" />
          </Link>
          <h1 className="truncate font-display text-base font-bold">{title}</h1>
          <span className="ml-auto text-sm text-ink-soft">
            {doneCount}/{tasks.length}
          </span>
          {deadline && <Countdown deadline={deadline} onExpire={finish} />}
        </div>
        {/* Progress as a row of answer-sheet cells; tap to jump. */}
        <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Завдання">
          {tasks.map((t, i) => {
            const a = answered[t.id];
            const color = a?.result ? (a.result.correct ? "bg-good border-good" : "bg-bad border-bad") : a ? "bg-ink border-ink" : "border-ink-soft";
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Завдання ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-3 w-5 rounded-[3px] border ${color} ${i === index ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""}`}
              />
            );
          })}
        </div>
      </div>

      {task && (
        <TaskCard
          key={task.id}
          task={task}
          runId={runId}
          instant={instant}
          initialResponse={answered[task.id]?.response ?? null}
          initialResult={answered[task.id]?.result ?? null}
          onAnswered={(id, response, result) => {
            setAnswered((a) => ({ ...a, [id]: { response, result } }));
            if (!instant) setTimeout(next, 250);
          }}
          onSimilar={(t) => {
            setTasks((ts) => [...ts.slice(0, index + 1), t, ...ts.slice(index + 1)]);
            setIndex(index + 1);
          }}
          tag={task.position ? <span>Завдання {task.position} в НМТ</span> : null}
          next={
            doneCount < tasks.length
              ? { label: "Далі", onClick: next }
              : { label: finishing ? "Підраховую…" : "Подивитися результат", onClick: finish, disabled: finishing }
          }
        />
      )}

      {doneCount < tasks.length && (
        <div className="mt-10 border-t border-grid pt-4">
          <button type="button" disabled={finishing} onClick={finishWithConfirm} className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink">
            {finishing ? "Підраховую…" : "Завершити достроково"}
          </button>
        </div>
      )}
    </div>
  );
}
