// Points, mastery, topic scores and the NMT scale. Pure functions (unit-tested in scoring.test.ts).
import type { Answer, TaskFormat } from "./types";

export const EXAM_MAX_POINTS = 45; // 25 single-choice × 1 + 5 matching × 4

export function maxPointsForFormat(format: TaskFormat): number {
  return format === "matching" ? 4 : 1;
}

/** Grades a response. Matching earns 1 point per correct pair. */
export function grade(format: TaskFormat, answer: Answer, response: unknown) {
  const max = maxPointsForFormat(format);
  if (format === "matching") {
    const key = answer as Record<string, string>;
    const resp = (response ?? {}) as Record<string, string>;
    const points = Object.keys(key).filter((k) => resp[k] === key[k]).length;
    return { points, max, correct: points === max };
  }
  const ok = typeof response === "string" && response === answer;
  return { points: ok ? 1 : 0, max, correct: ok };
}

export const MASTERY_WINDOW = 20;
const DECAY = 0.85;

/**
 * Recency-weighted accuracy with a Beta(1,1) prior.
 * `scores` are fractions 0..1 (points / maxPoints), newest first.
 */
export function mastery(scores: number[]): number {
  let num = 1;
  let den = 2;
  scores.slice(0, MASTERY_WINDOW).forEach((s, i) => {
    const w = DECAY ** i;
    num += w * s;
    den += w;
  });
  return num / den;
}

export const UNTESTED_MASTERY = 0.5;

// ---------- Topic knowledge on the NMT 100–200 scale ----------
// Every topic counts equally. A topic's score maps mastery 0..1 linearly onto 100..200.

export function topicScore(m: number): number {
  return Math.round(100 + 100 * Math.min(1, Math.max(0, m)));
}

/** Overall score = average of the scores of topics the student has already tried. */
export function overallScore(masteries: number[]): number | null {
  if (!masteries.length) return null;
  return topicScore(masteries.reduce((a, b) => a + b, 0) / masteries.length);
}

export type Level = "weak" | "ok" | "strong";
export const LEVEL_BOUNDS = { ok: 140, strong: 170 } as const;
export const LEVEL_LABEL: Record<Level, string> = { weak: "Треба підтягнути", ok: "Непогано", strong: "Сильно" };

export function level(score: number): Level {
  if (score >= LEVEL_BOUNDS.strong) return "strong";
  if (score >= LEVEL_BOUNDS.ok) return "ok";
  return "weak";
}

// Test points → 100–200 scale.
// TODO: replace with the official УЦОЯО 2026 conversion table for Ukrainian when published.
// Until then this is an approximation: below the pass threshold there is no rating score,
// and between the threshold and the maximum the scale is interpolated linearly.
export const PASS_THRESHOLD_POINTS = 7;
export function toNmtScale(testPoints: number): number | null {
  const p = Math.round(testPoints);
  if (p < PASS_THRESHOLD_POINTS) return null;
  return Math.round(100 + ((p - PASS_THRESHOLD_POINTS) / (EXAM_MAX_POINTS - PASS_THRESHOLD_POINTS)) * 100);
}
