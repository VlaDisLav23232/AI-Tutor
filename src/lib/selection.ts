// Task pickers for each mode. Pure helpers are exported for unit tests.
import type { Task } from "@/generated/prisma/client";
import { prisma } from "./db";
import { UNTESTED_MASTERY, weakestLabels } from "./scoring";
import { generateForCategory, KB_CATEGORIES } from "./ai/generate";

export type Rng = () => number;

export interface CategoryInfo {
  label: string;
  /** Real tasks in the bank; used to pick the most common topics for the diagnostic. */
  taskCount: number;
  positionShares: Record<string, number>;
  inDiagnostic: boolean;
  isMatching: boolean;
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function weightedChoice<T>(items: T[], weight: (t: T) => number, rng: Rng = Math.random): T | null {
  const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
  if (total <= 0) return items.length ? items[Math.floor(rng() * items.length)] : null;
  let r = rng() * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

/** For each exam position 1–30, a category sampled by how often it appeared there. */
export function sampleExamLayout(categories: CategoryInfo[], rng: Rng = Math.random): { position: number; label: string }[] {
  const layout: { position: number; label: string }[] = [];
  for (let position = 1; position <= 30; position++) {
    const candidates = categories.filter((c) => (c.positionShares[position] ?? 0) > 0);
    const chosen = weightedChoice(candidates, (c) => c.positionShares[position], rng);
    if (chosen) layout.push({ position, label: chosen.label });
  }
  return layout;
}

/** Diagnostic categories: the most common single-choice topics + two matching topics. */
export function diagnosticCategories(categories: CategoryInfo[]): string[] {
  const eligible = categories.filter((c) => c.inDiagnostic).sort((a, b) => b.taskCount - a.taskCount);
  const single = eligible.filter((c) => !c.isMatching).slice(0, 14).map((c) => c.label);
  // Always-present exam topics replace the lightest picks (never each other).
  const musts = ["stress", "sentence_order"].filter((m) => eligible.some((c) => c.label === m && !c.isMatching));
  let slot = single.length - 1;
  for (const must of musts) {
    if (single.includes(must)) continue;
    while (slot >= 0 && musts.includes(single[slot])) slot--;
    if (slot >= 0) single[slot--] = must;
  }
  const matching = ["phraseology_matching", ...eligible.filter((c) => c.isMatching && c.label !== "phraseology_matching").map((c) => c.label)];
  return [...new Set(single)].concat(matching.slice(0, 2));
}

// ---------- DB-backed pickers ----------

export async function loadCategories(): Promise<CategoryInfo[]> {
  const [cats, matching, counts] = await Promise.all([
    prisma.category.findMany(),
    prisma.task.groupBy({ by: ["categoryLabel"], where: { format: "matching" } }),
    prisma.task.groupBy({ by: ["categoryLabel"], where: { source: "nmt2026" }, _count: true }),
  ]);
  const matchingSet = new Set(matching.map((m) => m.categoryLabel));
  const countOf = Object.fromEntries(counts.map((c) => [c.categoryLabel, c._count]));
  return cats.map((c) => ({
    label: c.label,
    taskCount: countOf[c.label] ?? 0,
    positionShares: c.positionShares as Record<string, number>,
    inDiagnostic: c.inDiagnostic,
    isMatching: matchingSet.has(c.label),
  }));
}

async function seenTaskIds(userId: string): Promise<Map<string, Date>> {
  const rows = await prisma.attempt.findMany({ where: { userId }, select: { taskId: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  return new Map(rows.map((r) => [r.taskId, r.createdAt]));
}

/** Prefers unseen real tasks, then unseen generated ones, then the least recently seen. */
function rankForUser(tasks: Task[], seen: Map<string, Date>, rng: Rng = Math.random): Task[] {
  const unseen = shuffle(tasks.filter((t) => !seen.has(t.id)), rng).sort((a, b) => (a.source === b.source ? 0 : a.source === "nmt2026" ? -1 : 1));
  const old = tasks.filter((t) => seen.has(t.id)).sort((a, b) => seen.get(a.id)!.getTime() - seen.get(b.id)!.getTime());
  return [...unseen, ...old];
}

export async function pickDiagnostic(): Promise<string[]> {
  const labels = diagnosticCategories(await loadCategories());
  const ids: string[] = [];
  for (const label of labels) {
    const tasks = await prisma.task.findMany({ where: { categoryLabel: label, source: "nmt2026" }, select: { id: true } });
    if (tasks.length) ids.push(tasks[Math.floor(Math.random() * tasks.length)].id);
  }
  return ids;
}

export const TOPIC_TEST_SIZE = 10;

export async function pickTopic(userId: string, label: string): Promise<string[]> {
  const [tasks, seen] = await Promise.all([prisma.task.findMany({ where: { categoryLabel: label, verified: true } }), seenTaskIds(userId)]);
  const ranked = rankForUser(tasks, seen);
  const ids = ranked.filter((t) => !seen.has(t.id)).map((t) => t.id);
  // Knowledge-base topics can always be topped up with fresh tasks instantly and for free.
  while (ids.length < TOPIC_TEST_SIZE && KB_CATEGORIES.has(label)) {
    const g = await generateForCategory(label, null);
    if (!g) break;
    ids.push(g.id);
  }
  // Otherwise repeat the least recently seen ones.
  for (const t of ranked) if (ids.length < TOPIC_TEST_SIZE && !ids.includes(t.id)) ids.push(t.id);
  return ids.slice(0, TOPIC_TEST_SIZE);
}

export async function pickExam(): Promise<string[]> {
  const layout = sampleExamLayout(await loadCategories());
  const ids: string[] = [];
  for (const { position, label } of layout) {
    const tasks = await prisma.task.findMany({ where: { categoryLabel: label, source: "nmt2026", id: { notIn: ids } } });
    const atPosition = tasks.filter((t) => t.position === position);
    const pool = atPosition.length ? atPosition : tasks;
    if (pool.length) ids.push(pool[Math.floor(Math.random() * pool.length)].id);
  }
  return ids;
}

const RECENT_WINDOW = 20;
const MISTAKE_DAYS = 7;

/** Why a practice task was chosen; shown to the student. null = an ordinary task, shown without a label. */
export type PracticeReason = "repeat" | "mistake" | "review" | "weak" | null;
export type PracticeFocus = "all" | "weakest";

/** Practice weight of a topic: lower mastery → much more likely. */
export function weaknessWeight(m: number | undefined): number {
  return (1 - (m ?? UNTESTED_MASTERY)) ** 2;
}

export type PracticeBranch = "mistakes" | "review" | "weak" | "random";

/**
 * Which source the next task comes from, for a random number r in [0, 1):
 * - "all":     15% mistakes and «!», 20% topics due for review, 35% weak topics (weighted), 30% any topic (equal chance);
 * - "weakest": 20% mistakes and «!», 20% review, 60% weak — all inside the 5 weakest topics.
 */
export function practiceBranch(r: number, focus: PracticeFocus): PracticeBranch {
  if (focus === "weakest") return r < 0.2 ? "mistakes" : r < 0.4 ? "review" : "weak";
  return r < 0.15 ? "mistakes" : r < 0.35 ? "review" : r < 0.7 ? "weak" : "random";
}

/**
 * Next practice task, one at a time (see practiceBranch for the mix). A branch with nothing to offer falls back
 * to a weighted weak-topic pick. The «Слабка тема» label is shown only for topics currently in the bottom 5.
 * Never spends AI money: when a topic is exhausted it repeats the oldest seen task
 * (stress and foreign words get fresh tasks from the free knowledge base).
 */
export async function pickPracticeTask(userId: string, focus: PracticeFocus = "all"): Promise<{ task: Task; reason: PracticeReason } | null> {
  const [categories, masteryRows, recent] = await Promise.all([
    loadCategories(),
    prisma.mastery.findMany({ where: { userId } }),
    prisma.attempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, include: { task: true } }),
  ]);
  const recentIds = new Set(recent.slice(0, RECENT_WINDOW).map((a) => a.taskId));
  const mastery = Object.fromEntries(masteryRows.map((m) => [m.categoryLabel, m]));
  const all = categories.filter((c) => c.label !== "other");
  const weakest = new Set(weakestLabels(all.map((c) => c.label), Object.fromEntries(masteryRows.map((m) => [m.categoryLabel, m.value]))));
  const usable = focus === "weakest" ? all.filter((c) => weakest.has(c.label)) : all;
  const usableSet = new Set(usable.map((c) => c.label));
  const lastLabel = recent[0]?.task.categoryLabel;
  const notLast = (c: CategoryInfo) => !(c.label === lastLabel && usable.length > 1);
  const branch = practiceBranch(Math.random(), focus);

  if (branch === "mistakes") {
    const repeat = await prisma.savedTask.findMany({ where: { userId, kind: "repeat" }, include: { task: true }, orderBy: { createdAt: "asc" } });
    const marked = repeat.find((s) => !recentIds.has(s.taskId) && usableSet.has(s.task.categoryLabel));
    if (marked) return { task: marked.task, reason: "repeat" };
    const cutoff = Date.now() - MISTAKE_DAYS * 864e5;
    const dayAgo = Date.now() - 864e5;
    for (const m of recent.filter((a) => !a.correct && a.createdAt.getTime() > cutoff && usableSet.has(a.task.categoryLabel))) {
      const twin = await prisma.task.findFirst({ where: { parentTaskId: m.taskId, verified: true, id: { notIn: [...recentIds] } } });
      if (twin) return { task: twin, reason: "mistake" };
      if (m.createdAt.getTime() < dayAgo && !recentIds.has(m.taskId)) return { task: m.task, reason: "mistake" };
    }
  }

  let label: string | null = null;
  let fromReview = false;
  if (branch === "review") {
    const due = usable.filter((c) => mastery[c.label] && mastery[c.label].nextReviewAt.getTime() <= Date.now());
    label = due.length ? due[Math.floor(Math.random() * due.length)].label : null;
    fromReview = !!label;
  }
  if (!label && branch === "random") {
    const pool = usable.filter(notLast);
    label = pool.length ? pool[Math.floor(Math.random() * pool.length)].label : null;
  }
  if (!label) {
    // Damp the topic just practiced so the same one doesn't come up back to back.
    label = weightedChoice(usable, (c) => weaknessWeight(mastery[c.label]?.value) * (notLast(c) ? 1 : 0.2))?.label ?? null;
  }
  if (!label) return null;
  const reason: PracticeReason = fromReview ? "review" : weakest.has(label) ? "weak" : null;

  const seen = await seenTaskIds(userId);
  const tasks = (await prisma.task.findMany({ where: { categoryLabel: label, verified: true } })).filter((t) => !recentIds.has(t.id));
  const next = rankForUser(tasks, seen)[0];
  if (next && !seen.has(next.id)) return { task: next, reason };
  if (KB_CATEGORIES.has(label)) {
    const fresh = await generateForCategory(label, null).catch(() => null);
    if (fresh) return { task: fresh, reason };
  }
  return next ? { task: next, reason } : null;
}
