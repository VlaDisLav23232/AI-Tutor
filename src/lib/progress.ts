// Recording attempts and updating topic mastery, spaced review, the daily goal and the streak.
import { prisma } from "./db";
import { grade, mastery, MASTERY_WINDOW, maxPointsForFormat, topicScore, UNTESTED_MASTERY } from "./scoring";
import { RECENT_FOR_REVIEW, reviewDate, scheduleAfterAnswer } from "./srs";
import type { Answer, TaskFormat } from "./types";

export const DAILY_GOAL = 10;

export function kyivDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(d); // YYYY-MM-DD
}

export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Streak as it stands today: it survives until the end of the day after the last completed goal. */
export function currentStreak(streak: number, lastActiveDate: string | null, today = kyivDate()): number {
  if (!lastActiveDate) return 0;
  return lastActiveDate === today || lastActiveDate === shiftDay(today, -1) ? streak : 0;
}

/** Recomputes mastery and the review schedule for one topic after an answer. */
async function updateTopic(userId: string, categoryLabel: string, correct: boolean) {
  const attempts = await prisma.attempt.findMany({
    where: { userId, task: { categoryLabel } },
    orderBy: { createdAt: "desc" },
    take: MASTERY_WINDOW,
  });
  const scores = attempts.map((a) => a.points / a.maxPoints);
  const value = mastery(scores);
  const recent = scores.slice(0, RECENT_FOR_REVIEW);
  const recentAccuracy = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
  const count = await prisma.attempt.count({ where: { userId, task: { categoryLabel } } });
  const now = new Date();
  const prev = await prisma.mastery.findUnique({ where: { userId_categoryLabel: { userId, categoryLabel } } });
  const schedule = prev
    ? scheduleAfterAnswer({ intervalDays: prev.intervalDays, nextReviewAt: prev.nextReviewAt, now, correct, recentAccuracy })
    : { intervalDays: 1, nextReviewAt: reviewDate(now, 1) };
  await prisma.mastery.upsert({
    where: { userId_categoryLabel: { userId, categoryLabel } },
    create: { userId, categoryLabel, value, attempts: count, lastPracticedAt: now, ...schedule },
    update: { value, attempts: count, lastPracticedAt: now, ...schedule },
  });
  return { before: prev?.value ?? null, after: value };
}

/** Counts the task towards today's goal; extends the streak when the goal is reached. */
async function countTowardsGoal(userId: string) {
  const today = kyivDate();
  const day = await prisma.dayActivity.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (day.count !== DAILY_GOAL) return { todayCount: day.count, streakExtended: false };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.lastActiveDate === today) return { todayCount: day.count, streakExtended: false };
  const streak = user.lastActiveDate === shiftDay(today, -1) ? user.streak + 1 : 1;
  await prisma.user.update({
    where: { id: userId },
    data: { streak, lastActiveDate: today, bestStreak: Math.max(user.bestStreak, streak) },
  });
  return { todayCount: day.count, streakExtended: true };
}

export async function recordAttempt(input: { userId: string; runId: string; taskId: string; response: unknown; msSpent?: number }) {
  const [run, task] = await Promise.all([
    prisma.testRun.findUnique({ where: { id: input.runId } }),
    prisma.task.findUnique({ where: { id: input.taskId }, include: { category: true } }),
  ]);
  if (!run || run.userId !== input.userId) throw new Error("run not found");
  if (!task) throw new Error("task not found");
  if (!run.taskIds.includes(task.id)) throw new Error("task is not part of this run");
  if (run.finishedAt) throw new Error("run already finished");

  const existing = await prisma.attempt.findUnique({ where: { runId_taskId: { runId: run.id, taskId: task.id } } });
  if (existing) return { attempt: existing, answer: task.answer as Answer, topic: null, goal: null }; // first answer counts

  const answer = task.answer as Answer;
  const result = grade(task.format as TaskFormat, answer, input.response);
  const attempt = await prisma.attempt.create({
    data: {
      userId: input.userId,
      runId: run.id,
      taskId: task.id,
      response: input.response as object,
      correct: result.correct,
      points: result.points,
      maxPoints: result.max,
      msSpent: input.msSpent ?? 0,
    },
  });
  const m = await updateTopic(input.userId, task.categoryLabel, attempt.correct);
  // A "!" task that has now been solved correctly has served its purpose.
  if (attempt.correct) await prisma.savedTask.deleteMany({ where: { userId: input.userId, taskId: task.id, kind: "repeat" } });
  const goal = await countTowardsGoal(input.userId);
  return {
    attempt,
    answer,
    topic: {
      label: task.categoryLabel,
      name: task.category.nameUa,
      before: topicScore(m.before ?? UNTESTED_MASTERY),
      after: topicScore(m.after),
      firstTime: m.before === null,
    },
    goal: { ...goal, dailyGoal: DAILY_GOAL },
  };
}

/** Closes a run and records its score. */
export async function finishRun(userId: string, runId: string) {
  const run = await prisma.testRun.findUnique({ where: { id: runId }, include: { attempts: true } });
  if (!run || run.userId !== userId) throw new Error("run not found");
  if (run.finishedAt) return run;
  const tasks = await prisma.task.findMany({ where: { id: { in: run.taskIds } } });
  const maxScore = tasks.reduce((s, t) => s + maxPointsForFormat(t.format as TaskFormat), 0);
  const score = run.attempts.reduce((s, a) => s + a.points, 0);
  return prisma.testRun.update({ where: { id: runId }, data: { finishedAt: new Date(), score, maxScore } });
}

/** Topic score as it was before `at` (for "before → after" on result pages); null if untried then. */
export async function topicScoreBefore(userId: string, categoryLabel: string, at: Date): Promise<number | null> {
  const attempts = await prisma.attempt.findMany({
    where: { userId, task: { categoryLabel }, createdAt: { lt: at } },
    orderBy: { createdAt: "desc" },
    take: MASTERY_WINDOW,
  });
  return attempts.length ? topicScore(mastery(attempts.map((a) => a.points / a.maxPoints))) : null;
}

/** Continues the user's open practice session from the last 12 hours, or starts a new one. */
export async function getOrCreatePracticeRun(userId: string) {
  const since = new Date(Date.now() - 12 * 3600_000);
  return (
    (await prisma.testRun.findFirst({ where: { userId, mode: "practice", finishedAt: null, startedAt: { gte: since } }, orderBy: { startedAt: "desc" } })) ??
    (await prisma.testRun.create({ data: { userId, mode: "practice", taskIds: [] } }))
  );
}
