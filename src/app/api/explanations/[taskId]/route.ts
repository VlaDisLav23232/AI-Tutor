import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aiRateLimited, jsonError, withUser } from "@/lib/api";
import { generateExplanation } from "@/lib/ai/explain";
import { AiUnavailableError, aiEnabled } from "@/lib/ai/client";

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

/**
 * Runs the explanation agent (and saves the result). Called only when the student presses «Пояснити (AI)».
 * Streams NDJSON: {type:"step", step} for each agent action, then {type:"done", content, status} or {type:"error", error}.
 */
export const POST = withUser(async (userId, _req: Request, ctx: Ctx) => {
  const { taskId } = await ctx.params;
  const denied = await checkAccess(userId, taskId);
  if (denied) return denied;
  const cached = await prisma.explanation.findUnique({ where: { taskId } });
  if (cached) return ndjson([{ type: "done", content: cached.content, status: cached.status }]);
  if (aiRateLimited(userId)) return jsonError(429, "Забагато запитів до AI, спробуй пізніше");
  if (!aiEnabled()) throw new AiUnavailableError();

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the student leaves, the agent still finishes and saves the explanation for next time.
      let open = true;
      const send = (event: object) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        const explanation = await generateExplanation(taskId, (step) => send({ type: "step", step }));
        send({ type: "done", content: explanation.content, status: explanation.status });
      } catch (e) {
        if (!(e instanceof AiUnavailableError)) console.error(e);
        send({ type: "error", error: e instanceof AiUnavailableError ? e.message : "Не вдалося пояснити. Спробуй ще раз." });
      }
      if (open) {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});

function ndjson(events: object[]) {
  return new Response(events.map((e) => JSON.stringify(e) + "\n").join(""), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
