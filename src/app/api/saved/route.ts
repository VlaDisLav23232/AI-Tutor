import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, withUser } from "@/lib/api";

const Body = z.object({ taskId: z.string(), kind: z.enum(["favorite", "repeat"]), on: z.boolean() });

/** Toggles ★ (favorite) or ! (repeat: "give me this exact task again") on a task. */
export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректний запит");
  const { taskId, kind, on } = parsed.data;
  if (on) {
    if (!(await prisma.task.findUnique({ where: { id: taskId } }))) return jsonError(404, "Завдання не знайдено");
    await prisma.savedTask.upsert({ where: { userId_taskId_kind: { userId, taskId, kind } }, create: { userId, taskId, kind }, update: {} });
  } else {
    await prisma.savedTask.deleteMany({ where: { userId, taskId, kind } });
  }
  return NextResponse.json({ ok: true });
});
