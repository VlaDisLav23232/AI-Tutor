import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aiRateLimited, jsonError, withUser } from "@/lib/api";
import { generateExplanation } from "@/lib/ai/explain";

type Ctx = { params: Promise<{ taskId: string }> };

/** Explanations reveal the key, so only after the user has answered (and, in exams, finished). */
async function checkAccess(userId: string, taskId: string) {
  const attempt = await prisma.attempt.findFirst({ where: { userId, taskId }, include: { run: true } });
  if (!attempt) return jsonError(403, "Спершу дай відповідь на завдання");
  if (["diagnostic", "exam"].includes(attempt.run.mode) && !attempt.run.finishedAt) return jsonError(403, "Пояснення буде після завершення тесту");
  return null;
}

/** Saved explanation only — never calls the AI. 404 means none has been generated yet. */
export const GET = withUser(async (userId, _req: Request, ctx: Ctx) => {
  const { taskId } = await ctx.params;
  const denied = await checkAccess(userId, taskId);
  if (denied) return denied;
  const cached = await prisma.explanation.findUnique({ where: { taskId } });
  if (!cached) return jsonError(404, "Пояснення ще немає");
  return NextResponse.json({ content: cached.content, status: cached.status });
});

/** Generates (and saves) an explanation. Called only when the student presses «Пояснити (AI)». */
export const POST = withUser(async (userId, _req: Request, ctx: Ctx) => {
  const { taskId } = await ctx.params;
  const denied = await checkAccess(userId, taskId);
  if (denied) return denied;
  const cached = await prisma.explanation.findUnique({ where: { taskId } });
  if (cached) return NextResponse.json({ content: cached.content, status: cached.status });
  if (aiRateLimited(userId)) return jsonError(429, "Забагато запитів до AI, спробуй пізніше");
  const explanation = await generateExplanation(taskId);
  return NextResponse.json({ content: explanation.content, status: explanation.status });
});
