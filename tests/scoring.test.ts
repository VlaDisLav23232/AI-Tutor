import { describe, expect, it } from "vitest";
import { EXAM_MAX_POINTS, grade, level, mastery, overallScore, toNmtScale, topicScore } from "@/lib/scoring";
import { reviewDate, scheduleAfterAnswer } from "@/lib/srs";
import { currentStreak } from "@/lib/progress";

describe("grade", () => {
  it("scores single choice as 0 or 1", () => {
    expect(grade("single", "Б", "Б")).toEqual({ points: 1, max: 1, correct: true });
    expect(grade("single", "Б", "А")).toEqual({ points: 0, max: 1, correct: false });
    expect(grade("single", "Б", null)).toEqual({ points: 0, max: 1, correct: false });
  });

  it("gives matching one point per correct pair", () => {
    const key = { "1": "Б", "2": "Г", "3": "А", "4": "Д" };
    expect(grade("matching", key, { "1": "Б", "2": "Г", "3": "В", "4": "А" })).toEqual({ points: 2, max: 4, correct: false });
    expect(grade("matching", key, key)).toEqual({ points: 4, max: 4, correct: true });
  });
});

describe("mastery", () => {
  it("starts at the 0.5 prior with no data", () => {
    expect(mastery([])).toBe(0.5);
  });

  it("weights recent answers more than old ones", () => {
    const recentRight = mastery([1, 1, 0, 0]);
    const recentWrong = mastery([0, 0, 1, 1]);
    expect(recentRight).toBeGreaterThan(recentWrong);
  });

  it("approaches 1 with many correct answers but never reaches it", () => {
    const m = mastery(Array(20).fill(1));
    expect(m).toBeGreaterThan(0.85);
    expect(m).toBeLessThan(1);
  });
});

describe("topic scores on the 100–200 scale", () => {
  it("maps mastery linearly and clamps", () => {
    expect(topicScore(0)).toBe(100);
    expect(topicScore(0.5)).toBe(150);
    expect(topicScore(1)).toBe(200);
    expect(topicScore(1.2)).toBe(200);
  });

  it("averages topics equally and ignores untried ones", () => {
    expect(overallScore([])).toBeNull();
    expect(overallScore([0.2, 0.8])).toBe(150);
  });

  it("puts scores into three levels", () => {
    expect(level(139)).toBe("weak");
    expect(level(140)).toBe("ok");
    expect(level(170)).toBe("strong");
  });

  it("maps exam test points to 100–200 with a pass threshold", () => {
    expect(toNmtScale(0)).toBeNull();
    expect(toNmtScale(EXAM_MAX_POINTS)).toBe(200);
    const mid = toNmtScale(26)!;
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(200);
  });
});

describe("spaced review after each answer", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const past = reviewDate(now, -1);
  const future = reviewDate(now, 3);

  it("brings a topic back tomorrow after a mistake", () => {
    const s = scheduleAfterAnswer({ intervalDays: 6, nextReviewAt: future, now, correct: false, recentAccuracy: 0.9 });
    expect(s.intervalDays).toBe(1);
    expect(s.nextReviewAt).toEqual(reviewDate(now, 1));
  });

  it("pushes a due topic further when recent answers are good", () => {
    const s = scheduleAfterAnswer({ intervalDays: 2.5, nextReviewAt: past, now, correct: true, recentAccuracy: 0.8 });
    expect(s.intervalDays).toBe(6.25);
  });

  it("leaves the schedule alone for a correct answer before the topic is due", () => {
    const s = scheduleAfterAnswer({ intervalDays: 2.5, nextReviewAt: future, now, correct: true, recentAccuracy: 1 });
    expect(s).toEqual({ intervalDays: 2.5, nextReviewAt: future });
  });
});

describe("streak", () => {
  it("is alive today and yesterday, broken after that", () => {
    expect(currentStreak(5, "2026-10-06", "2026-10-06")).toBe(5);
    expect(currentStreak(5, "2026-10-05", "2026-10-06")).toBe(5);
    expect(currentStreak(5, "2026-10-04", "2026-10-06")).toBe(0);
    expect(currentStreak(0, null, "2026-10-06")).toBe(0);
  });
});
