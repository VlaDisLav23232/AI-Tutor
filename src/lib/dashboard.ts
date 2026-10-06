import { prisma } from "./db";
import { level, overallScore, topicScore, type Level } from "./scoring";
import { currentStreak, DAILY_GOAL, kyivDate, shiftDay } from "./progress";

export interface TopicRow {
  label: string;
  nameUa: string;
  group: string;
  score: number | null; // 100–200, null = not tried yet
  level: Level | null;
  attempts: number;
  dueForReview: boolean;
}

export async function getTopics(userId: string): Promise<TopicRow[]> {
  const [cats, rows] = await Promise.all([
    prisma.category.findMany({ where: { label: { not: "other" } }, orderBy: { nameUa: "asc" } }),
    prisma.mastery.findMany({ where: { userId } }),
  ]);
  const byLabel = Object.fromEntries(rows.map((r) => [r.categoryLabel, r]));
  const now = Date.now();
  return cats.map((c) => {
    const m = byLabel[c.label];
    const score = m ? topicScore(m.value) : null;
    return {
      label: c.label,
      nameUa: c.nameUa,
      group: c.group,
      score,
      level: score === null ? null : level(score),
      attempts: m?.attempts ?? 0,
      dueForReview: !!m && m.nextReviewAt.getTime() <= now,
    };
  });
}

/** Weakest topics: lowest scores among tried ones, topped up with untried topics. */
export function weakestTopics(topics: TopicRow[], n = 3): TopicRow[] {
  const tried = topics.filter((t) => t.score !== null).sort((a, b) => a.score! - b.score!);
  return [...tried, ...topics.filter((t) => t.score === null)].slice(0, n);
}

export interface StreakInfo {
  current: number;
  best: number;
  todayCount: number;
  dailyGoal: number;
  /** Last 7 days, oldest first. */
  week: { date: string; count: number; goalMet: boolean; isToday: boolean }[];
}

export async function getStreak(userId: string): Promise<StreakInfo> {
  const today = kyivDate();
  const dates = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
  const [user, days] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.dayActivity.findMany({ where: { userId, date: { in: dates } } }),
  ]);
  const byDate = Object.fromEntries(days.map((d) => [d.date, d.count]));
  const current = currentStreak(user.streak, user.lastActiveDate, today);
  return {
    current,
    best: Math.max(user.bestStreak, current),
    todayCount: byDate[today] ?? 0,
    dailyGoal: DAILY_GOAL,
    week: dates.map((date) => ({ date, count: byDate[date] ?? 0, goalMet: (byDate[date] ?? 0) >= DAILY_GOAL, isToday: date === today })),
  };
}

export async function getDashboard(userId: string) {
  const [user, topics, streak, diagnostic, savedCounts] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getTopics(userId),
    getStreak(userId),
    prisma.testRun.findFirst({ where: { userId, mode: "diagnostic", finishedAt: { not: null } } }),
    prisma.savedTask.groupBy({ by: ["kind"], where: { userId }, _count: true }),
  ]);
  const tried = topics.filter((t) => t.score !== null);
  const masteries = await prisma.mastery.findMany({ where: { userId, categoryLabel: { not: "other" } }, select: { value: true } });
  return {
    name: user.name,
    overall: overallScore(masteries.map((m) => m.value)),
    triedCount: tried.length,
    topicCount: topics.length,
    topics,
    weakest: weakestTopics(topics),
    dueCount: topics.filter((t) => t.dueForReview).length,
    streak,
    saved: Object.fromEntries(savedCounts.map((c) => [c.kind, c._count])) as Record<string, number>,
    hasDiagnostic: !!diagnostic,
  };
}
