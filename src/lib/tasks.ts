import type { Task } from "@/generated/prisma/client";
import { prisma } from "./db";
import type { Answer, PassageSentence, SavedKind, TaskDTO, TaskFormat } from "./types";

/** Client-safe view of a task: never includes the answer key. */
export function toDTO(t: Task): TaskDTO {
  return {
    id: t.id,
    categoryLabel: t.categoryLabel,
    format: t.format as TaskFormat,
    position: t.position,
    question: t.question,
    passage: (t.passage as PassageSentence[] | null) ?? null,
    items: (t.items as Record<string, string> | null) ?? null,
    options: t.options as Record<string, string>,
    source: t.source,
  };
}

/** DTOs with the user's ★ / ! marks attached. */
export async function toDTOsFor(userId: string, tasks: Task[]): Promise<TaskDTO[]> {
  const marks = await prisma.savedTask.findMany({ where: { userId, taskId: { in: tasks.map((t) => t.id) } } });
  return tasks.map((t) => ({ ...toDTO(t), saved: marks.filter((m) => m.taskId === t.id).map((m) => m.kind as SavedKind) }));
}

export async function getTaskWithKey(id: string) {
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return null;
  return { task: toDTO(t), answer: t.answer as Answer, row: t };
}
