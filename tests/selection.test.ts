import { describe, expect, it } from "vitest";
import { diagnosticCategories, practiceBranch, sampleExamLayout, weaknessWeight, weightedChoice, type CategoryInfo } from "@/lib/selection";
import { weakestLabels } from "@/lib/scoring";
import { generateForeignDraft, generateStressDraft } from "@/lib/ai/generate";

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const cat = (label: string, shares: Record<string, number>, extra: Partial<CategoryInfo> = {}): CategoryInfo => ({
  label,
  taskCount: Math.round(Object.values(shares).reduce((s, v) => s + v, 0) * 17),
  positionShares: shares,
  inDiagnostic: true,
  isMatching: false,
  ...extra,
});

describe("exam layout", () => {
  it("fills every position from the categories seen there", () => {
    const shares: Record<string, number> = {};
    for (let p = 1; p <= 30; p++) shares[p] = 1;
    const cats = [cat("x", shares)];
    const layout = sampleExamLayout(cats, seeded(1));
    expect(layout).toHaveLength(30);
    expect(layout.map((l) => l.position)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("follows the position shares", () => {
    const cats = [cat("stress", { "1": 0.9 }), cat("lexis", { "1": 0.1 })];
    const rng = seeded(42);
    let stress = 0;
    for (let i = 0; i < 1000; i++) if (sampleExamLayout(cats, rng)[0].label === "stress") stress++;
    expect(stress).toBeGreaterThan(850);
  });
});

describe("weightedChoice", () => {
  it("never picks zero-weight items when others have weight", () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) expect(weightedChoice(["a", "b"], (x) => (x === "a" ? 0 : 1), rng)).toBe("b");
  });
});

describe("practice weighting", () => {
  it("prefers weaker topics, and every topic counts the same otherwise", () => {
    expect(weaknessWeight(0.2)).toBeGreaterThan(weaknessWeight(0.8));
    expect(weaknessWeight(undefined)).toBe(weaknessWeight(0.5));
  });
});

describe("diagnostic", () => {
  it("takes the most common single-choice topics plus two matching topics and always includes stress", () => {
    const cats = [
      ...Array.from({ length: 20 }, (_, i) => cat(`t${i}`, { [String(i + 1)]: 1 })),
      cat("stress", { "5": 0.1 }),
      cat("sentence_order", { "21": 0.9 }),
      cat("phraseology_matching", { "27": 1 }, { isMatching: true }),
      cat("parts_of_speech_matching", { "30": 1 }, { isMatching: true }),
      cat("other", { "11": 1 }, { inDiagnostic: false }),
    ];
    const labels = diagnosticCategories(cats);
    expect(labels).toHaveLength(16);
    expect(labels).toContain("stress");
    expect(labels).toContain("sentence_order");
    expect(labels.slice(-2)).toEqual(["phraseology_matching", "parts_of_speech_matching"]);
    expect(labels).not.toContain("other");
  });
});

describe("knowledge-base generators", () => {
  it("builds a stress task with exactly one wrongly stressed word in the answer row", () => {
    for (let i = 0; i < 50; i++) {
      const d = generateStressDraft();
      expect(Object.keys(d.options)).toHaveLength(4);
      expect(d.options[d.answer as string]).toBeDefined();
      for (const row of Object.values(d.options)) expect(row.match(/⟦/g)).toHaveLength(3);
      // Explained from the official list: the answer row is the only one with a mistake.
      expect(d.explanation?.options.find((o) => o.correct)?.letter).toBe(d.answer);
      expect(d.explanation?.options.find((o) => o.correct)?.why).toContain("помилка");
    }
  });

  it("builds a foreign-word task whose key is the equivalent", () => {
    const d = generateForeignDraft();
    expect(Object.keys(d.options)).toHaveLength(4);
    expect(new Set(Object.values(d.options)).size).toBe(4);
    expect(d.explanation?.options.find((o) => o.correct)?.why).toContain(d.options[d.answer as string]);
  });
});

describe("weakest-topics pool", () => {
  const labels = ["a", "b", "c", "d", "e", "f", "g"];
  const m = { a: 0.3, b: 0.4, c: 0.5, d: 0.6, e: 0.7, f: 0.8, g: 0.9 };

  it("holds the 5 lowest-mastery topics", () => {
    expect(weakestLabels(labels, m)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("lets the 6th-weakest in when one of the 5 improves past it", () => {
    expect(weakestLabels(labels, { ...m, a: 0.85 })).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("fills with untried topics only when fewer than 5 are tried", () => {
    expect(weakestLabels(labels, { a: 0.9, b: 0.2 })).toEqual(["b", "a", "c", "d", "e"]);
  });

  it("breaks ties by label so dashboard and practice agree", () => {
    expect(weakestLabels(["z", "y", "x"], { z: 0.5, y: 0.5, x: 0.5 }, 2)).toEqual(["x", "y"]);
  });
});

describe("practice mix", () => {
  const share = (focus: "all" | "weakest") => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const b = practiceBranch(i / 1000, focus);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    return counts;
  };

  it("mixes all topics: 15% mistakes, 20% review, 35% weak, 30% any topic", () => {
    expect(share("all")).toEqual({ mistakes: 150, review: 200, weak: 350, random: 300 });
  });

  it("never picks a random topic in the weakest mode", () => {
    expect(share("weakest")).toEqual({ mistakes: 200, review: 200, weak: 600 });
  });
});
