import { requireUserId } from "@/auth";
import { prisma } from "@/lib/db";
import { getStreak } from "@/lib/dashboard";
import { getOrCreatePracticeRun } from "@/lib/progress";
import { PracticePlayer } from "@/components/PracticePlayer";

export default async function Practice({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const userId = await requireUserId();
  const focus = (await searchParams).focus === "weakest" ? "weakest" : "all";
  const [run, categories, streak] = await Promise.all([
    getOrCreatePracticeRun(userId),
    prisma.category.findMany({ select: { label: true, nameUa: true } }),
    getStreak(userId),
  ]);
  return (
    <PracticePlayer
      key={focus}
      runId={run.id}
      focus={focus}
      categoryNames={Object.fromEntries(categories.map((c) => [c.label, c.nameUa]))}
      todayCount={streak.todayCount}
      dailyGoal={streak.dailyGoal}
      totalCount={streak.totalCount}
    />
  );
}
