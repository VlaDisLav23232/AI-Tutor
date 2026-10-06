import { z } from "zod";
import { prisma } from "@/lib/db";
import { aiRateLimited, jsonError, withUser } from "@/lib/api";
import { streamTaskChat } from "@/lib/ai/chat";

const Body = z.object({
  taskId: z.string(),
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .min(1)
    .max(20),
});

export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success || parsed.data.turns.at(-1)?.role !== "user") return jsonError(400, "Некоректний запит");
  if (aiRateLimited(userId)) return jsonError(429, "Забагато запитів до AI, спробуй пізніше");

  // The key may be discussed only once the student has answered (and, for exams, finished).
  const attempt = await prisma.attempt.findFirst({ where: { userId, taskId: parsed.data.taskId }, include: { run: true } });
  const revealKey = Boolean(attempt && (!["diagnostic", "exam"].includes(attempt.run.mode) || attempt.run.finishedAt));

  const body = await streamTaskChat({
    taskId: parsed.data.taskId,
    turns: parsed.data.turns,
    revealKey,
    studentResponse: revealKey ? attempt?.response : undefined,
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
