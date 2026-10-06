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

export interface ExplanationContent {
  rule: string;
  ruleRef: string | null;
  whyCorrect: string;
  /** For single/order: letter → why that option is wrong. For matching: unused letters. */
  whyWrong: Record<Letter, string>;
  /** Matching only: item number → why its correct letter fits. */
  perItem?: Record<string, string>;
}

export type RunMode = "diagnostic" | "topic" | "practice" | "exam" | "saved";

export const LETTERS = ["А", "Б", "В", "Г", "Д"] as const;
