import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { aiRateLimited, jsonError, withUser } from "@/lib/api";
import { similarTask } from "@/lib/ai/generate";
import { toDTOsFor } from "@/lib/tasks";

const Body = z.object({ taskId: z.string(), runId: z.string() });

/** "Ще одне таке завдання": appends a twin of the task to the current topic/practice run. */
export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректний запит");
  const run = await prisma.testRun.findUnique({ where: { id: parsed.data.runId } });
  if (!run || run.userId !== userId || run.finishedAt || !["topic", "practice", "saved"].includes(run.mode)) {
    return jsonError(400, "Схожі завдання доступні в тестах за темою та в практиці");
  }
  if (aiRateLimited(userId)) return jsonError(429, "Забагато запитів до AI, спробуй пізніше");

  const task = await similarTask(parsed.data.taskId, userId);
  if (!task) return jsonError(404, "Не вдалося підібрати схоже завдання");
  if (!run.taskIds.includes(task.id)) await prisma.testRun.update({ where: { id: run.id }, data: { taskIds: { push: task.id } } });
  const [dto] = await toDTOsFor(userId, [task]);
  return NextResponse.json({ task: dto });
});
