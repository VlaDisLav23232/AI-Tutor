// Spaced review per topic, updated after every answer:
// - a wrong answer brings the topic back tomorrow;
// - a correct answer on a topic that is due, with recent accuracy ≥ 80%, pushes the next review 2.5× further;
// - a correct answer before the topic is due changes nothing.
export const GOOD_ACCURACY = 0.8;
export const GROWTH = 2.5;
export const RECENT_FOR_REVIEW = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function reviewDate(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export function scheduleAfterAnswer(s: {
  intervalDays: number;
  nextReviewAt: Date;
  now: Date;
  correct: boolean;
  /** Accuracy (0..1) over the last few answers in this topic, including this one. */
  recentAccuracy: number;
}): { intervalDays: number; nextReviewAt: Date } {
  if (!s.correct) return { intervalDays: 1, nextReviewAt: reviewDate(s.now, 1) };
  const due = s.nextReviewAt.getTime() <= s.now.getTime();
  if (due && s.recentAccuracy >= GOOD_ACCURACY) {
    const intervalDays = Math.max(1, s.intervalDays) * GROWTH;
    return { intervalDays, nextReviewAt: reviewDate(s.now, intervalDays) };
  }
  return { intervalDays: s.intervalDays, nextReviewAt: s.nextReviewAt };
}
