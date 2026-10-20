// Shared content types. Kept free of server imports so client components can use them.

export type TaskFormat = "single" | "order" | "matching";
export type Letter = string; // "А" | "Б" | "В" | "Г" | "Д"

export type PassageSentence = { shape: string; text: string };

/** Answer: a letter for single/order, item→letter map for matching. */
export type Answer = Letter | Record<string, Letter>;

export interface TaskDTO {
  id: string;
  categoryLabel: string;
  format: TaskFormat;
  position: number | null;
  question: string;
  passage: PassageSentence[] | null;
  items: Record<string, string> | null;
  options: Record<Letter, string>;
  source: string;
  /** Marks the current user put on this task: "favorite" (★) and/or "repeat" (!). */
  saved?: SavedKind[];
}

export type SavedKind = "favorite" | "repeat";

/** Topic score change after one answer, on the 100–200 scale. */
export interface TopicDelta {
  label: string;
  name: string;
  before: number;
  after: number;
  firstTime: boolean;
}

export interface GoalProgress {
  todayCount: number;
  dailyGoal: number;
  streakExtended: boolean;
}

/** Verdict on one answer option: is it the right one, and why (1–2 punchy sentences, no textbook rule). */
export interface OptionVerdict {
  letter: Letter;
  correct: boolean;
  why: string;
}

/** Matching: item → its letter and the reason, shown as "1 — Г, бо …". */
export interface ItemVerdict {
  item: string;
  letter: Letter;
  why: string;
}

/**
 * Explanation format v2. Cached once per task and shared by all students, so it holds a verdict for every
 * option; the UI puts the student's wrong option first, then the correct one.
 * Older v1 explanations ({rule, whyCorrect, whyWrong}) are treated as missing and regenerated on request.
 */
export interface ExplanationContent {
  v: 2;
  /** Single choice and sentence order: one verdict per option. Empty for matching. */
  options: OptionVerdict[];
  /** Matching only. */
  items: ItemVerdict[];
  /** A rule of thumb or mnemonic in one sentence; null when there is nothing worth adding (e.g. phraseology). */
  takeaway: string | null;
}

export function isCurrentExplanation(content: unknown): content is ExplanationContent {
  return typeof content === "object" && content !== null && (content as { v?: unknown }).v === 2;
}

/** One line of the explanation agent's progress, shown while it works. Never mentions § numbers. */
export interface AgentStep {
  kind: "start" | "search" | "check" | "submit" | "fallback" | "done";
  /** true = a check passed, false = it failed, absent = neutral. */
  ok?: boolean;
  text: string;
}

export type RunMode = "diagnostic" | "topic" | "practice" | "exam" | "saved";

export const LETTERS = ["А", "Б", "В", "Г", "Д"] as const;

/**
 * Display order of option verdicts for one student: a wrong option first, then the correct one; if they were right
 * (or skipped), only the correct one. `rest` holds the remaining options.
 */
export function orderVerdicts(c: ExplanationContent, chosen: string | null): { lead: OptionVerdict[]; rest: OptionVerdict[] } {
  const right = c.options.find((o) => o.correct);
  const picked = c.options.find((o) => o.letter === chosen);
  const lead = (picked && !picked.correct ? [picked, right] : [right]).filter((o): o is OptionVerdict => Boolean(o));
  return { lead, rest: c.options.filter((o) => !lead.includes(o)) };
}
