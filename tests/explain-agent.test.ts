import { describe, expect, it } from "vitest";
import { missingParts, wrongParts } from "@/lib/ai/explain";
import type { TaskDTO } from "@/lib/types";

const task: TaskDTO = {
  id: "t1",
  categoryLabel: "apostrophe",
  format: "single",
  position: 1,
  question: "Апостроф треба писати в усіх словах рядка",
  passage: null,
  items: null,
  options: { А: "...", Б: "...", В: "...", Г: "..." },
  source: "nmt2026",
};

const long = (s: string) => s.padEnd(70, ".");
const submission = (over: Partial<Parameters<typeof missingParts>[0]> = {}) => ({
  action: "submit" as const,
  query: "",
  answer: "Б",
  pairs: [],
  rule: long("Апостроф пишемо після губних перед я, ю, є, ї"),
  whyCorrect: long("У рядку Б усі слова мають губний перед я"),
  whyWrong: ["А", "В", "Г"].map((letter) => ({ letter, why: long(`Варіант ${letter} не підходить`) })),
  tip: "Згадай «бурям'ян».",
  ...over,
});

describe("explanation agent checks", () => {
  it("checks a single-choice answer against the key", () => {
    expect(wrongParts({ answer: "б", pairs: [] }, "Б")).toBe(0);
    expect(wrongParts({ answer: "В", pairs: [] }, "Б")).toBe(1);
  });

  it("counts wrong items in a matching answer", () => {
    const pairs = [
      { item: "1", letter: "А", why: "" },
      { item: "2", letter: "Г", why: "" },
    ];
    expect(wrongParts({ answer: "", pairs }, { "1": "А", "2": "Б", "3": "В" })).toBe(2);
  });

  it("accepts a complete explanation", () => {
    expect(missingParts(submission(), task, "Б")).toEqual([]);
  });

  it("rejects a submission that skips an option", () => {
    const out = submission({ whyWrong: [{ letter: "А", why: long("ні") }] });
    expect(missingParts(out, task, "Б")).toContain("не пояснено варіанти В, Г");
  });

  it("rejects mentions of paragraphs", () => {
    const out = submission({ rule: long("Згідно з § 7, апостроф пишемо після губних") });
    expect(missingParts(out, task, "Б")).toContain("прибери згадки про параграфи і правопис");
  });
});
