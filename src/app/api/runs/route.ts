import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, withUser } from "@/lib/api";
import { DIAGNOSTIC_MINUTES, EXAM_MINUTES } from "@/lib/config";
import { pickDiagnostic, pickExam, pickTopic } from "@/lib/selection";


const Body = z.object({
  mode: z.enum(["diagnostic", "topic", "practice", "exam", "saved"]),
  categoryLabel: z.string().optional(),
  savedKind: z.enum(["favorite", "repeat"]).optional(),
});

export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректний запит");
  const { mode, categoryLabel, savedKind } = parsed.data;

  let taskIds: string[] = [];
  let timeLimitSec: number | null = null;
  if (mode === "diagnostic") {
    taskIds = await pickDiagnostic();
    timeLimitSec = DIAGNOSTIC_MINUTES * 60;
  } else if (mode === "exam") {
    taskIds = await pickExam();
    timeLimitSec = EXAM_MINUTES * 60;
  } else if (mode === "topic") {
    if (!categoryLabel || !(await prisma.category.findUnique({ where: { label: categoryLabel } }))) {
      return jsonError(400, "Невідома тема");
    }
    taskIds = await pickTopic(userId, categoryLabel);
  } else if (mode === "saved") {
    const saved = await prisma.savedTask.findMany({ where: { userId, kind: savedKind ?? "favorite" }, orderBy: { createdAt: "desc" } });
    taskIds = saved.map((s) => s.taskId);
    if (!taskIds.length) return jsonError(400, "Тут поки немає збережених завдань");
  }
  // Practice starts empty; tasks are appended one by one by /api/practice/next.

  const run = await prisma.testRun.create({
    data: { userId, mode, categoryLabel: categoryLabel ?? null, taskIds, timeLimitSec },
  });
  return NextResponse.json({ runId: run.id });
});
