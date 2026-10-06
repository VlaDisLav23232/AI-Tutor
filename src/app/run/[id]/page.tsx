import { notFound, redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { prisma } from "@/lib/db";
import { toDTOsFor } from "@/lib/tasks";
import type { Answer, RunMode } from "@/lib/types";
import { RunPlayer } from "@/components/RunPlayer";
import type { CheckResult } from "@/components/task/TaskCard";
import type { Response } from "@/components/task/TaskView";

const TITLES: Record<RunMode, string> = {
  diagnostic: "Діагностика",
  topic: "Тест за темою",
  practice: "Практика",
  exam: "Варіант НМТ",
  saved: "Збережені завдання",
};

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const run = await prisma.testRun.findUnique({ where: { id }, include: { attempts: true } });
  if (!run || run.userId !== userId) notFound();
  if (run.finishedAt) redirect(`/run/${id}/result`);
  if (run.mode === "practice") redirect("/practice");

  const rows = await prisma.task.findMany({ where: { id: { in: run.taskIds } } });
  const byId = new Map(rows.map((t) => [t.id, t]));
  const tasks = run.taskIds.map((tid) => byId.get(tid)).filter((t) => !!t);
  const instant = run.mode === "topic" || run.mode === "saved";

  const answered: Record<string, { response: Response; result: CheckResult | null }> = {};
  for (const a of run.attempts) {
    const t = byId.get(a.taskId);
    answered[a.taskId] = {
      response: a.response as Response,
      result: instant && t ? { correct: a.correct, points: a.points, maxPoints: a.maxPoints, answer: t.answer as Answer } : null,
    };
  }

  let title = TITLES[run.mode as RunMode];
  if (run.categoryLabel) {
    const c = await prisma.category.findUnique({ where: { label: run.categoryLabel } });
    if (c) title = c.nameUa;
  }
  const deadline = run.timeLimitSec ? run.startedAt.getTime() + run.timeLimitSec * 1000 : null;

  return <RunPlayer runId={run.id} mode={run.mode as RunMode} title={title} tasks={await toDTOsFor(userId, tasks)} answered={answered} deadline={deadline} />;
}
