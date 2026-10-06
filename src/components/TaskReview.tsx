"use client";

import { useState } from "react";
import type { Answer, TaskDTO } from "@/lib/types";
import { Feedback } from "./task/Feedback";
import { TaskView, type Response } from "./task/TaskView";

interface Props {
  index: number;
  task: TaskDTO;
  categoryName: string;
  answer: Answer;
  response: Response;
  points: number;
  maxPoints: number;
}

/** Collapsible review of one answered task; the explanation loads only when opened. */
export function TaskReview({ index, task, categoryName, answer, response, points, maxPoints }: Props) {
  const [open, setOpen] = useState(false);
  const status = response === null ? "без відповіді" : points === maxPoints ? "правильно" : points > 0 ? `${points}/${maxPoints}` : "помилка";
  const color = response === null ? "text-ink-soft" : points === maxPoints ? "text-good" : "text-bad";
  return (
    <div className="rounded-md border border-grid">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-2">
        <span className="w-6 font-display text-sm font-bold">{index}</span>
        <span className="flex-1">{categoryName}</span>
        <span className={`text-sm ${color}`}>{status}</span>
      </button>
      {open && (
        <div className="border-t border-grid p-4">
          <TaskView task={task} value={response} onChange={() => {}} locked answer={answer} />
          {response !== null && <Feedback taskId={task.id} response={response} answer={answer} points={points} maxPoints={maxPoints} />}
          {response === null && <p className="mt-4 text-ink-soft">Правильна відповідь: {typeof answer === "string" ? answer : Object.entries(answer).map(([k, v]) => `${k}–${v}`).join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
