// "One more task like this": reuse a stored twin, generate deterministically from the knowledge
// base (stress, foreign words), or generate with Sonnet and keep only what Haiku can verify.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/tasks";
import { formatRules, retrieveRules } from "@/lib/rag";
import { LETTERS, type Answer, type ExplanationContent, type TaskDTO } from "@/lib/types";
import stressKb from "@/data/kb-stress.json";
import idiomKb from "@/data/kb-idioms.json";
import foreignKb from "@/data/kb-foreign.json";
import { aiEnabled, claude, MODEL_MAIN, renderTask, systemBlocks, trackUsage } from "./client";
import { blindSolveMatches } from "./verify";
import type { Task } from "@/generated/prisma/client";

type StressWord = { word: string; stressed: number[]; note?: string };
const VOWELS = "аеєиіїоуюя";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T>(arr: T[], n: number) => shuffle(arr).slice(0, n);

interface Draft {
  categoryLabel: string;
  format: "single" | "matching";
  question: string;
  items?: Record<string, string>;
  options: Record<string, string>;
  answer: Answer;
  explanation?: ExplanationContent;
}

async function saveDraft(d: Draft, parentTaskId: string | null): Promise<Task> {
  const id = `g-${randomUUID().slice(0, 8)}`;
  const task = await prisma.task.create({
    data: {
      id,
      categoryLabel: d.categoryLabel,
      format: d.format,
      question: d.question,
      items: d.items,
      options: d.options,
      answer: d.answer,
      source: "generated",
      parentTaskId,
      verified: true,
    },
  });
  if (d.explanation) {
    await prisma.explanation.create({
      data: { taskId: id, content: d.explanation as object, status: "verified", model: "knowledge-base" },
    });
  }
  return task;
}

// ---------- Deterministic generators (no AI needed) ----------

function markStress(w: StressWord, vowelIndex: number): string {
  const word = w.word;
  return word.slice(0, vowelIndex) + `⟦${word[vowelIndex]}⟧` + word.slice(vowelIndex + 1);
}
const showCorrect = (w: StressWord) =>
  [...w.word].map((ch, i) => (w.stressed.includes(i) ? ch.toUpperCase() : ch)).join("");

function wrongVowel(w: StressWord): number | null {
  const candidates = [...w.word].map((ch, i) => (VOWELS.includes(ch) && !w.stressed.includes(i) ? i : -1)).filter((i) => i >= 0);
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

export function generateStressDraft(): Draft {
  // "ОКРІМ" form: three rows fully correct, one row contains one wrongly stressed word.
  const all = stressKb as StressWord[];
  // The planted mistake needs a word that has at least one vowel that is NOT a valid stress.
  const bad = pick(all.filter((w) => wrongVowel(w) !== null), 1)[0];
  const words = pick(all.filter((w) => w.word !== bad.word), 11);
  const badRow = Math.floor(Math.random() * 4);
  const badWordIdx = Math.floor(Math.random() * 3);
  words.splice(badRow * 3 + badWordIdx, 0, bad);
  const rows = [0, 1, 2, 3].map((r) => words.slice(r * 3, r * 3 + 3));
  const options: Record<string, string> = {};
  const whyWrong: Record<string, string> = {};
  rows.forEach((row, r) => {
    const rendered = row.map((w) => markStress(w, w === bad ? wrongVowel(w)! : w.stressed[0]));
    options[LETTERS[r]] = rendered.join(", ");
    if (r !== badRow) whyWrong[LETTERS[r]] = `У цьому рядку всі наголоси правильні: ${row.map(showCorrect).join(", ")}.`;
  });
  return {
    categoryLabel: "stress",
    format: "single",
    question: "Правильно виділено букви на позначення наголошених голосних у всіх словах, ОКРІМ рядка",
    options,
    answer: LETTERS[badRow],
    explanation: {
      rule: "Наголос у словах з орфоепічного мінімуму НМТ потрібно запам'ятати: правильну форму перевіряють за орфоепічним словником.",
      ruleRef: null,
      whyCorrect: `У рядку ${LETTERS[badRow]} наголос позначено неправильно в слові «${bad.word}»: правильно — ${showCorrect(bad)}${bad.note ? ` (${bad.note})` : ""}.`,
      whyWrong,
    },
  };
}

export function generateForeignDraft(): Draft {
  const all = foreignKb as { word: string; equivalent: string; distractors: string[] }[];
  const entry = all[Math.floor(Math.random() * all.length)];
  const otherEquivalents = all.filter((e) => e !== entry).map((e) => e.equivalent);
  const distractors = pick([...new Set([...entry.distractors, ...otherEquivalents])].filter((d) => d !== entry.equivalent), 3);
  const shuffled = shuffle([entry.equivalent, ...distractors]);
  const options = Object.fromEntries(shuffled.map((o, i) => [LETTERS[i], o]));
  const answer = LETTERS[shuffled.indexOf(entry.equivalent)];
  return {
    categoryLabel: "foreign_word_equivalent",
    format: "single",
    question: `Українським відповідником до іншомовного слова ${entry.word.toUpperCase()} є`,
    options,
    answer,
    explanation: {
      rule: "Іншомовні слова часто мають питомо українські відповідники з тим самим значенням.",
      ruleRef: null,
      whyCorrect: `«${entry.word}» означає те саме, що «${entry.equivalent}».`,
      whyWrong: Object.fromEntries(
        Object.entries(options)
          .filter(([l]) => l !== answer)
          .map(([l, o]) => [l, `«${o}» має інше значення, ніж «${entry.word}».`]),
      ),
    },
  };
}

// ---------- LLM generators (verified by a blind Haiku solve) ----------

const SentencesSchema = z.object({
  sentences: z.array(z.object({ idiom: z.string(), sentence: z.string() })).describe("4 речення з пропуском […] на місці фразеологізму"),
});

async function generatePhraseologyDraft(): Promise<Draft | null> {
  const idioms = pick(idiomKb as { idiom: string; meaning: string }[], 5);
  const used = idioms.slice(0, 4);
  const res = await (await claude()).messages.parse({
    model: MODEL_MAIN,
    max_tokens: 3000,
    system: systemBlocks,
    output_config: { effort: "low", format: zodOutputFormat(SentencesSchema) },
    messages: [
      {
        role: "user",
        content: `Склади по одному реченню для кожного фразеологізму, як у завданнях НМТ. Фразеологізм заміни на «[…]». Речення має однозначно підказувати саме цей фразеологізм за його значенням і не підходити до інших.\n\n${used
          .map((i) => `- ${i.idiom} — ${i.meaning}`)
          .join("\n")}\n\nЩе один фразеологізм буде зайвим варіантом: ${idioms[4].idiom} — ${idioms[4].meaning}`,
      },
    ],
  });
  await trackUsage("generate(phraseology)", MODEL_MAIN, res.usage);
  const out = res.parsed_output;
  if (!out || out.sentences.length < 4) return null;
  const optionOrder = shuffle(idioms);
  const options = Object.fromEntries(optionOrder.map((i, k) => [LETTERS[k], i.idiom]));
  const letterOf = (idiom: string) => LETTERS[optionOrder.findIndex((i) => i.idiom === idiom)];
  const items: Record<string, string> = {};
  const answer: Record<string, string> = {};
  const perItem: Record<string, string> = {};
  used.forEach((idiom, k) => {
    const s = out.sentences.find((x) => x.idiom.trim().toLowerCase() === idiom.idiom.toLowerCase()) ?? out.sentences[k];
    items[String(k + 1)] = s.sentence;
    answer[String(k + 1)] = letterOf(idiom.idiom);
    perItem[String(k + 1)] = `${letterOf(idiom.idiom)} — «${idiom.idiom}»: ${idiom.meaning}`;
  });
  const spare = idioms[4];
  return {
    categoryLabel: "phraseology_matching",
    format: "matching",
    question: "Доберіть до кожного речення (1–4), у якому зроблено пропуск, відповідний за значенням фразеологізм (А–Д).",
    items,
    options,
    answer,
    explanation: {
      rule: "Фразеологізм добирають за значенням: воно має відповідати змісту речення.",
      ruleRef: null,
      whyCorrect: "Значення кожного фразеологізму збігається зі змістом відповідного речення.",
      whyWrong: { [letterOf(spare.idiom)]: `«${spare.idiom}» — ${spare.meaning}; жодне речення цього змісту не має.` },
      perItem,
    },
  };
}

const SingleSchema = z.object({
  question: z.string(),
  options: z.array(z.object({ letter: z.string(), text: z.string() })).describe("4 або 5 варіантів з літерами А, Б, В, Г, (Д)"),
  answer: z.string().describe("Літера єдиного правильного варіанта"),
});

async function generateSingleDraft(parent: Task): Promise<Draft | null> {
  const examples = await prisma.task.findMany({
    where: { categoryLabel: parent.categoryLabel, source: "nmt2026", format: "single", id: { not: parent.id } },
    take: 2,
  });
  const show = (t: Task) => renderTask(toDTO(t), t.answer as Answer);
  const rules = formatRules(retrieveRules(parent.categoryLabel, parent.question, 2));
  const res = await (await claude()).messages.parse({
    model: MODEL_MAIN,
    max_tokens: 4000,
    system: systemBlocks,
    output_config: { effort: "medium", format: zodOutputFormat(SingleSchema) },
    messages: [
      {
        role: "user",
        content: `Склади НОВЕ завдання НМТ того самого типу, що й приклади, щоб учень потренував ту саму навичку, на якій помилився в першому прикладі. Використай інші слова чи речення. Має бути рівно одна однозначно правильна відповідь за чинними нормами української мови. Виділення пиши в дужках ⟦…⟧, як у прикладах.\n\nДовідка для тебе:\n${rules}\n\nПриклад, у якому учень помилився:\n${show(parent)}\n\n${examples.map((e, i) => `Ще приклад ${i + 1}:\n${show(e)}`).join("\n\n")}`,
      },
    ],
  });
  await trackUsage("generate(single)", MODEL_MAIN, res.usage);
  const out = res.parsed_output;
  if (!out) return null;
  const options = Object.fromEntries(out.options.map((o) => [o.letter.trim(), o.text.trim()]));
  if (Object.keys(options).length < 4 || !(out.answer.trim() in options)) return null;
  return { categoryLabel: parent.categoryLabel, format: "single", question: out.question, options, answer: out.answer.trim() };
}

async function verified(draft: Draft | null): Promise<Draft | null> {
  if (!draft) return null;
  const dto: TaskDTO = {
    id: "draft",
    categoryLabel: draft.categoryLabel,
    format: draft.format,
    position: null,
    question: draft.question,
    passage: null,
    items: draft.items ?? null,
    options: draft.options,
    source: "generated",
  };
  return (await blindSolveMatches(dto, draft.answer)) ? draft : null;
}

// ---------- Entry points ----------

/** Topics generated from the knowledge base without any AI call (free). */
export const KB_CATEGORIES = new Set(["stress", "foreign_word_equivalent"]);

/** Fresh generated task for a category. Non-KB categories call Claude — only on explicit user request. */
export async function generateForCategory(categoryLabel: string, parent: Task | null): Promise<Task | null> {
  if (categoryLabel === "stress") return saveDraft(generateStressDraft(), parent?.id ?? null);
  if (categoryLabel === "foreign_word_equivalent") return saveDraft(generateForeignDraft(), parent?.id ?? null);
  if (!aiEnabled()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let draft: Draft | null = null;
    if (categoryLabel === "phraseology_matching") draft = await verified(await generatePhraseologyDraft());
    else if (parent && parent.format === "single") draft = await verified(await generateSingleDraft(parent));
    else return null; // sentence order and other matching types are not generated
    if (draft) return saveDraft(draft, parent?.id ?? null);
  }
  return null;
}

/** A twin of `parentTaskId` the user hasn't seen yet: stored twin → generated → unseen real task. */
export async function similarTask(parentTaskId: string, userId: string): Promise<Task | null> {
  const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
  if (!parent) return null;
  const seen = new Set((await prisma.attempt.findMany({ where: { userId }, select: { taskId: true } })).map((a) => a.taskId));

  const twins = await prisma.task.findMany({ where: { parentTaskId, verified: true } });
  const twin = twins.find((t) => !seen.has(t.id));
  if (twin) return twin;

  const generated = await generateForCategory(parent.categoryLabel, parent).catch((e) => {
    console.error("generation failed", e);
    return null;
  });
  if (generated) return generated;

  const real = await prisma.task.findMany({ where: { categoryLabel: parent.categoryLabel, id: { not: parent.id } } });
  return shuffle(real).find((t) => !seen.has(t.id)) ?? null;
}
