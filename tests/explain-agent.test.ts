import { describe, expect, it } from "vitest";
import { cleanMarks, missingParts, profileOf, wrongParts } from "@/lib/ai/explain";
import { explainStressFromKb, findHints, idiomMeanings, stressMistakes } from "@/lib/hints";
import { orderVerdicts, type ExplanationContent, type TaskDTO } from "@/lib/types";

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

const verdict = (letter: string, correct = false) => ({ letter, correct, why: `Варіант ${letter}: після губного перед я пишемо апостроф.` });
const submission = (over: Partial<Parameters<typeof missingParts>[0]> = {}) => ({
  options: ["А", "Б", "В", "Г"].map((l) => verdict(l, l === "Б")),
  items: [],
  takeaway: "«Мавпа Буф» — після м, в, п, б, ф перед я пишемо апостроф.",
  ...over,
});

describe("explanation agent checks", () => {
  it("checks a single-choice answer against the key", () => {
    expect(wrongParts({ answer: "б", items: [] }, "Б")).toBe(0);
    expect(wrongParts({ answer: "В", items: [] }, "Б")).toBe(1);
  });

  it("counts wrong items in a matching answer", () => {
    const items = [
      { item: "1", letter: "А", why: "" },
      { item: "2", letter: "Г", why: "" },
    ];
    expect(wrongParts({ answer: "", items }, { "1": "А", "2": "Б", "3": "В" })).toBe(2);
  });

  it("accepts a complete explanation", () => {
    expect(missingParts(submission(), task, "Б", "spelling")).toEqual([]);
  });

  it("rejects a submission that skips an option", () => {
    const out = submission({ options: [verdict("А"), verdict("Б", true)] });
    expect(missingParts(out, task, "Б", "spelling")).toContain("не пояснено варіанти В, Г");
  });

  it("rejects mentions of paragraphs", () => {
    const out = submission({ takeaway: "Згідно з § 7, апостроф пишемо після губних." });
    expect(missingParts(out, task, "Б", "spelling")).toContain("прибери згадки про параграфи і правопис");
  });

  it("rejects etymology in phraseology", () => {
    const key = { "1": "Б" };
    const out = submission({ options: [], items: [{ item: "1", letter: "Б", why: "походить від давнього звичаю" }] });
    expect(missingParts(out, { ...task, format: "matching" }, key, "phraseology")[0]).toContain("без походження");
  });

  it("rejects a stress that contradicts the official list", () => {
    const out = submission({ takeaway: "Запам'ятай: добОвий." });
    expect(missingParts(out, task, "Б", "stress")[0]).toContain("добОвий");
  });

  it("keeps short highlights and drops broken or sentence-long ones", () => {
    expect(cleanMarks("зап'⟦я⟧стний, ⟦брати участь⟧")).toBe("зап'⟦я⟧стний, ⟦брати участь⟧");
    expect(cleanMarks("зап'⟦я стний")).toBe("зап'я стний");
    expect(cleanMarks("⟦Тут уся відповідь виділена одним дуже довгим реченням⟧.")).toBe("Тут уся відповідь виділена одним дуже довгим реченням.");
  });

  it("maps topics to explanation styles", () => {
    expect(profileOf("stress")).toBe("stress");
    expect(profileOf("phraseology_matching")).toBe("phraseology");
    expect(profileOf("punctuation_error")).toBe("syntax");
  });
});

describe("knowledge-base hints", () => {
  it("checks stress marks against the official list, ignoring the first letter", () => {
    expect(stressMistakes("кропивА і черговИй")).toEqual([]);
    expect(stressMistakes("Черговий, кОпчений і копчЕний — обидва є у списку")).toEqual([]);
    expect(stressMistakes("кропИва")).toEqual(["кропИва"]);
  });

  it("explains a stress task from the list when every word is there", () => {
    const options = { А: "кроп⟦и⟧ва, чергов⟦и⟧й", Б: "кропив⟦а⟧, чергов⟦и⟧й" };
    const out = explainStressFromKb({ question: "… у всіх словах, ОКРІМ рядка", options }, "А");
    expect(out?.options.find((o) => o.correct)).toMatchObject({ letter: "А", why: "Тут помилка: правильно кропивА." });
    expect(out?.options.find((o) => !o.correct)?.why).toContain("Усі наголоси правильні");
  });

  it("leaves a stress task to the AI when a word is inflected or the key disagrees", () => {
    expect(explainStressFromKb({ question: "ОКРІМ", options: { А: "добов⟦і⟧ витрати", Б: "кропив⟦а⟧" } }, "А")).toBeNull();
    expect(explainStressFromKb({ question: "ОКРІМ", options: { А: "кроп⟦и⟧ва", Б: "кропив⟦а⟧" } }, "Б")).toBeNull();
  });

  it("offers the mnemonic triggered by a word in the task", () => {
    const stress = { categoryLabel: "stress", question: "", options: { А: "занест⟦и⟧ дрова" } };
    expect(findHints(stress)[0]).toContain("Нести, вести, везти");
    expect(findHints({ categoryLabel: "prefix_s_z", question: "", options: {} })[0]).toContain("кафе птах");
  });

  it("finds idiom meanings for the options", () => {
    expect(idiomMeanings({ categoryLabel: "phraseology_matching", question: "", options: { А: "Авгієві стайні" } })[0]).toContain("занедбане");
  });
});

describe("display order", () => {
  const content: ExplanationContent = {
    v: 2,
    options: ["А", "Б", "В", "Г"].map((l) => ({ letter: l, correct: l === "Б", why: l })),
    items: [],
    takeaway: null,
  };
  const letters = (r: ReturnType<typeof orderVerdicts>) => [r.lead.map((o) => o.letter), r.rest.map((o) => o.letter)];

  it("shows the student's wrong option first, then the correct one", () => {
    expect(letters(orderVerdicts(content, "В"))).toEqual([["В", "Б"], ["А", "Г"]]);
  });

  it("shows only the correct option when the student was right", () => {
    expect(letters(orderVerdicts(content, "Б"))).toEqual([["Б"], ["А", "В", "Г"]]);
  });
});
