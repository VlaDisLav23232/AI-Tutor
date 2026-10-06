import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, withUser } from "@/lib/api";

const Body = z.object({
  taskId: z.string(),
  kind: z.enum(["task", "explanation", "ai_reply"]),
  comment: z.string().max(1000).optional(),
});

export const POST = withUser(async (userId, req: Request) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return jsonError(400, "Некоректний запит");
  await prisma.report.create({ data: { userId, ...parsed.data } });
  return NextResponse.json({ ok: true });
});
