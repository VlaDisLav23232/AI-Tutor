import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, withUser } from "@/lib/api";
import { pickPracticeTask } from "@/lib/selection";
import { toDTOsFor } from "@/lib/tasks";

const Body = z.object({ runId: z.string(), focus: z.enum(["all", "weak"]).optional() });

export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректний запит");
  const run = await prisma.testRun.findUnique({ where: { id: parsed.data.runId } });
  if (!run || run.userId !== userId || run.mode !== "practice") return jsonError(404, "Практику не знайдено");

  const picked = await pickPracticeTask(userId, parsed.data.focus ?? "all");
  if (!picked) return jsonError(404, "Немає доступних завдань");
  // A task can be answered once per run; a repeat of one already answered here starts a fresh practice run.
  let runId = run.id;
  const answeredHere = await prisma.attempt.findUnique({ where: { runId_taskId: { runId: run.id, taskId: picked.task.id } } });
  if (answeredHere) {
    runId = (await prisma.testRun.create({ data: { userId, mode: "practice", taskIds: [picked.task.id] } })).id;
  } else if (!run.taskIds.includes(picked.task.id)) {
    await prisma.testRun.update({ where: { id: run.id }, data: { taskIds: { push: picked.task.id } } });
  }
  const [task] = await toDTOsFor(userId, [picked.task]);
  return NextResponse.json({ task, reason: picked.reason, runId });
});
