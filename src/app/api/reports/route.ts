import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, withUser } from "@/lib/api";
import { REPORT_REASONS } from "@/lib/reports";

const Body = z.object({
  taskId: z.string(),
  kind: z.enum(["task", "explanation"]),
  reason: z.string().max(40),
  comment: z.string().trim().max(1000).optional(),
});

export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректний запит");
  const { taskId, kind, reason, comment } = parsed.data;
  if (!(reason in REPORT_REASONS[kind])) return jsonError(400, "Невідома причина");

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { explanation: true } });
  if (!task) return jsonError(404, "Завдання не знайдено");

  // Explanations and generated tasks can be regenerated later, so keep exactly what the student saw.
  const snapshot = {
    task: { question: task.question, passage: task.passage, items: task.items, options: task.options, answer: task.answer, source: task.source },
    explanation: kind === "explanation" && task.explanation ? { content: task.explanation.content, status: task.explanation.status, model: task.explanation.model } : null,
  };
  const data = { reason, comment: comment || null, snapshot };

  // One open report per student, task and kind: a second submit updates it instead of piling up duplicates.
  const existing = await prisma.report.findFirst({ where: { userId, taskId, kind, status: "open" } });
  if (existing) await prisma.report.update({ where: { id: existing.id }, data });
  else await prisma.report.create({ data: { userId, taskId, kind, ...data } });
  return NextResponse.json({ ok: true });
});
