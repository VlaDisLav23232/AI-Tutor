// Explanations verified against the answer key:
// 1) The main model solves the task blind (no key) and explains; 2) if its answer matches the key the
// explanation is "verified"; 3) otherwise it is regenerated with the key and marked "needs_review".
// Every explanation is built like a tutor would: the rule first, then the rule applied to each option.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTaskWithKey } from "@/lib/tasks";
import { formatRules, retrieveRules } from "@/lib/rag";
import type { Answer, ExplanationContent, TaskDTO } from "@/lib/types";
import { AiUnavailableError, aiEnabled, generateJsonWithModel, renderTask } from "./client";

const WrongOption = z.object({ letter: z.string(), why: z.string() });
const Pair = z.object({ item: z.string(), letter: z.string(), why: z.string() });

const ExplanationSchema = z.object({
  answer: z.string().describe("Літера правильного варіанта (для завдань на відповідність — порожній рядок)"),
  pairs: z
    .array(Pair)
    .describe("Лише для відповідностей: для кожного пункту 1–4 — літера і 1–2 речення, як правило чи значення пов'язує пункт саме з цим варіантом"),
  rule: z
    .string()
    .describe("Правило, яке перевіряє завдання: 1–3 речення своїми словами, як факт, з коротким прикладом. Без згадок про джерело, параграфи чи «правопис»"),
  whyCorrect: z
    .string()
    .describe("2–4 речення: застосуй правило до правильного варіанта — назви конкретні слова, що в них перевіряємо і чому все збігається з правилом"),
  whyWrong: z
    .array(WrongOption)
    .describe("Для кожного неправильного (або зайвого) варіанта: 1–2 речення — яке саме слово чи місце порушує правило і як було б правильно"),
  tip: z.string().describe("Одна коротка порада, як запам'ятати це правило або швидко перевірити себе на іспиті"),
});
type ExplanationOutput = z.infer<typeof ExplanationSchema>;

function matchesKey(out: ExplanationOutput, answer: Answer): boolean {
  if (typeof answer === "string") return out.answer.trim().toUpperCase() === answer;
  return Object.entries(answer).every(([item, letter]) => out.pairs.find((p) => p.item.trim() === item)?.letter.trim() === letter);
}

function toContent(out: ExplanationOutput, answer: Answer): ExplanationContent {
  const content: ExplanationContent = {
    rule: out.rule,
    ruleRef: null,
    whyCorrect: out.whyCorrect,
    whyWrong: Object.fromEntries(out.whyWrong.map((w) => [w.letter.trim(), w.why])),
    tip: out.tip.trim() || undefined,
  };
  if (typeof answer !== "string") content.perItem = Object.fromEntries(out.pairs.map((p) => [p.item.trim(), p.why]));
  return content;
}

function instructions(withKey: boolean): string {
  const start = withKey
    ? "Правильна відповідь подана в завданні. Поясни учневі, чому вона правильна."
    : "Спершу розв'яжи завдання сам, потім поясни учневі розв'язок.";
  return `${start}
Побудуй пояснення як репетитор:
1) rule — назви правило, яке перевіряє це завдання, своїми словами, як факт, з коротким прикладом (приклади бери зі слів завдання або з дуже поширених, загальновідомих слів);
2) whyCorrect — застосуй це правило до правильного варіанта крок за кроком, з конкретними словами з завдання;
3) whyWrong — для кожного іншого варіанта покажи, яке саме слово порушує правило і як буде правильно;
4) tip — коротка порада, як не помилитися на іспиті.
Перевір кожне слово кожного варіанта окремо, перш ніж писати висновок. Для неправильного варіанта обов'язково назви те конкретне слово, яке не відповідає правилу, і напиши, як воно пишеться правильно.
Ключ завжди правильний: ніколи не пиши про помилки, неточності чи сумніви щодо ключа або умови.
Не згадуй, звідки правило, і не посилайся на довідку.`;
}

async function callExplain(task: TaskDTO, key: Answer | undefined) {
  const rules = formatRules(retrieveRules(task.categoryLabel, `${task.question} ${Object.values(task.options).join(" ")}`));
  const label = key ? "explain(with key)" : "explain(blind)";
  const { data, model } = await generateJsonWithModel({
    label,
    tier: "main",
    maxTokens: 8000,
    // Medium effort: high made Gemini take over a minute per explanation for the same answer.
    effort: "medium",
    schema: ExplanationSchema,
    prompt: `${instructions(key !== undefined)}\n\nДовідка для тебе (не цитуй і не згадуй):\n${rules}\n\n${renderTask(task, key)}`,
  });
  if (!data) throw new Error(`${label} failed: refused or unusable output`);
  return { out: data, model };
}

export async function generateExplanation(taskId: string) {
  if (!aiEnabled()) throw new AiUnavailableError();
  const found = await getTaskWithKey(taskId);
  if (!found) throw new Error(`task ${taskId} not found`);
  const { task, answer } = found;

  // `model` is whichever model wrote the final text (it can differ from the configured one after a fallback).
  let { out, model } = await callExplain(task, undefined);
  let status = "verified";
  if (!matchesKey(out, answer)) {
    ({ out, model } = await callExplain(task, answer));
    status = "needs_review";
  }
  const content = toContent(out, answer);
  return prisma.explanation.upsert({
    where: { taskId },
    create: { taskId, content: content as object, status, model },
    update: { content: content as object, status, model },
  });
}
