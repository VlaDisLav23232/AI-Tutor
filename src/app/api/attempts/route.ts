import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, withUser } from "@/lib/api";
import { recordAttempt } from "@/lib/progress";

const Body = z.object({
  runId: z.string(),
  taskId: z.string(),
  response: z.union([z.string(), z.record(z.string(), z.string())]),
  msSpent: z.number().int().nonnegative().optional(),
});

// Modes where the key is revealed only after the whole run is finished, like the real exam.
const DEFERRED_FEEDBACK = new Set(["diagnostic", "exam"]);

export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректна відповідь");
  const run = await prisma.testRun.findUnique({ where: { id: parsed.data.runId } });
  if (!run || run.userId !== userId) return jsonError(404, "Тест не знайдено");

  const { attempt, answer, topic, goal } = await recordAttempt({ userId, ...parsed.data });
  if (DEFERRED_FEEDBACK.has(run.mode)) return NextResponse.json({ attemptId: attempt.id, saved: true, goal });
  return NextResponse.json({
    attemptId: attempt.id,
    correct: attempt.correct,
    points: attempt.points,
    maxPoints: attempt.maxPoints,
    answer,
    topic,
    goal,
  });
});
