import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { finishRun } from "@/lib/progress";

export const POST = withUser(async (userId, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const run = await finishRun(userId, id);
  return NextResponse.json({ score: run.score, maxScore: run.maxScore });
});
