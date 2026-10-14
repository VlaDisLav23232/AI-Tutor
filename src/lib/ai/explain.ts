// Explanation agent. Goal: an explanation that matches the answer key, is built on a real rule and covers every option.
// Each step the model picks one action; the code runs it and feeds the result back:
//   search_rules(query) — more rule fragments (free, local search);
//   check_answer(answer) — "correct"/"wrong" against the key, which the model never sees (free);
//   submit(explanation)  — the code checks the answer and completeness; rejected with a reason, or accepted (done).
// Stops when a submission is accepted, or after MAX_WRONG wrong answers / MAX_STEPS steps; then the explanation is
// written with the key and marked "needs_review" (the student is told AI wasn't sure).
// The happy path is a single call (submit right away), the same cost as a plain explanation.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTaskWithKey } from "@/lib/tasks";
import { formatRules, retrieveRules, searchRules, type RuleChunk } from "@/lib/rag";
import type { AgentStep, Answer, ExplanationContent, TaskDTO } from "@/lib/types";
import { AiUnavailableError, aiEnabled, generateJsonWithModel, renderTask } from "./client";

const MAX_STEPS = 5;
const MAX_WRONG = 2;
const MAX_SEARCHES = 2;

const WrongOption = z.object({ letter: z.string(), why: z.string() });
const Pair = z.object({ item: z.string(), letter: z.string(), why: z.string() });

const explanationFields = {
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
};

/** Used only for the fallback, when the explanation is written with the key. */
const ExplanationSchema = z.object({
  answer: z.string().describe("Літера правильного варіанта (для завдань на відповідність — порожній рядок)"),
  ...explanationFields,
});
type ExplanationOutput = z.infer<typeof ExplanationSchema>;

// A flat object rather than a union: every provider's structured output supports it. Unused fields stay empty.
const StepSchema = z.object({
  action: z.enum(["search_rules", "check_answer", "submit"]),
  query: z.string().describe("Лише для search_rules: що шукати в правилах, 3–8 слів. Інакше порожній рядок"),
  answer: z.string().describe("Для check_answer і submit: літера твоєї відповіді (для відповідностей — порожній рядок, пункти в pairs)"),
  ...explanationFields,
});
type StepOutput = z.infer<typeof StepSchema>;

const INSTRUCTIONS = `Ти — агент, що готує пояснення до завдання НМТ. Ключа ти не бачиш: розв'яжи завдання сам.
Щокроку обери одну дію (поле action):
- submit — надіслати відповідь і повне пояснення. Код перевірить відповідь за ключем і повноту пояснення. Якщо ти впевнений, роби submit одразу: це найдешевше.
- check_answer — лише перевірити відповідь (answer або pairs) за ключем, без пояснення. Корисно, якщо вагаєшся між варіантами: так не доведеться переписувати пояснення.
- search_rules — знайти інше правило (query: 3–8 слів). Корисно, якщо довідка не про те, що перевіряє завдання.
Якщо відповідь виявилась неправильною, не повторюй її: подумай, яке правило ти застосував хибно, за потреби знайди інше і розв'яжи заново.
Для дій search_rules і check_answer поля пояснення залиш порожніми.

Пояснення (лише для submit) будуй як репетитор:
1) rule — правило, яке перевіряє це завдання, своїми словами, як факт, з коротким прикладом (приклади бери зі слів завдання або з дуже поширених слів);
2) whyCorrect — застосуй це правило до правильного варіанта крок за кроком, з конкретними словами з завдання;
3) whyWrong — для кожного іншого варіанта: яке саме слово порушує правило і як буде правильно;
4) tip — коротка порада, як не помилитися на іспиті.
Перевір кожне слово кожного варіанта окремо, перш ніж писати висновок. Не згадуй, звідки правило, і не посилайся на довідку.`;

const KEY_INSTRUCTIONS = `Правильна відповідь подана в завданні. Поясни учневі, чому вона правильна.
Побудуй пояснення як репетитор:
1) rule — назви правило, яке перевіряє це завдання, своїми словами, як факт, з коротким прикладом;
2) whyCorrect — застосуй це правило до правильного варіанта крок за кроком, з конкретними словами з завдання;
3) whyWrong — для кожного іншого варіанта покажи, яке саме слово порушує правило і як буде правильно;
4) tip — коротка порада, як не помилитися на іспиті.
Ключ завжди правильний: ніколи не пиши про помилки, неточності чи сумніви щодо ключа або умови.
Не згадуй, звідки правило, і не посилайся на довідку.`;

// ---------- Checks done by code (the agent's tools) ----------

/** Number of wrong parts: 0 or 1 for single choice, wrong items for matching. */
export function wrongParts(out: Pick<StepOutput, "answer" | "pairs">, key: Answer): number {
  if (typeof key === "string") return out.answer.trim().toUpperCase() === key ? 0 : 1;
  return Object.entries(key).filter(([item, letter]) => out.pairs.find((p) => p.item.trim() === item)?.letter.trim().toUpperCase() !== letter).length;
}

function answerFeedback(wrong: number, key: Answer): string {
  if (wrong === 0) return "правильно";
  return typeof key === "string" ? "неправильно" : `неправильно: помилка в ${wrong} з ${Object.keys(key).length} пунктів`;
}

/** What is missing from a submitted explanation; empty when it is complete. */
export function missingParts(out: StepOutput, task: TaskDTO, key: Answer): string[] {
  const problems: string[] = [];
  if (out.rule.trim().length < 40) problems.push("правило не сформульоване");
  if (out.whyCorrect.trim().length < 60) problems.push("закоротке пояснення правильної відповіді");
  if (typeof key === "string") {
    const explained = new Set(out.whyWrong.filter((w) => w.why.trim().length >= 20).map((w) => w.letter.trim().toUpperCase()));
    const missing = Object.keys(task.options).filter((l) => l !== key && !explained.has(l));
    if (missing.length) problems.push(`не пояснено варіанти ${missing.join(", ")}`);
  } else {
    const missing = Object.keys(key).filter((item) => !out.pairs.find((p) => p.item.trim() === item && p.why.trim().length >= 20));
    if (missing.length) problems.push(`не пояснено пункти ${missing.join(", ")}`);
  }
  const text = [out.rule, out.whyCorrect, out.tip, ...out.whyWrong.map((w) => w.why), ...out.pairs.map((p) => p.why)].join(" ");
  if (/§|правопис/i.test(text)) problems.push("прибери згадки про параграфи і правопис");
  return problems;
}

function toContent(out: StepOutput | ExplanationOutput, key: Answer): ExplanationContent {
  const content: ExplanationContent = {
    rule: out.rule,
    ruleRef: null,
    whyCorrect: out.whyCorrect,
    whyWrong: Object.fromEntries(out.whyWrong.map((w) => [w.letter.trim(), w.why])),
    tip: out.tip.trim() || undefined,
  };
  if (typeof key !== "string") content.perItem = Object.fromEntries(out.pairs.map((p) => [p.item.trim(), p.why]));
  return content;
}

const describeAnswer = (out: Pick<StepOutput, "answer" | "pairs">, key: Answer) =>
  typeof key === "string" ? out.answer.trim().toUpperCase() : out.pairs.map((p) => `${p.item.trim()}–${p.letter.trim()}`).join(", ");

// ---------- The loop ----------

async function explainWithKey(task: TaskDTO, key: Answer, rules: string) {
  const { data, model } = await generateJsonWithModel({
    label: "explain(with key)",
    tier: "main",
    maxTokens: 8000,
    effort: "medium",
    schema: ExplanationSchema,
    prompt: `${KEY_INSTRUCTIONS}\n\nДовідка для тебе (не цитуй і не згадуй):\n${rules}\n\n${renderTask(task, key)}`,
  });
  if (!data) throw new Error("explain(with key) failed: refused or unusable output");
  return { content: toContent(data, key), model };
}

export async function generateExplanation(taskId: string, onStep: (s: AgentStep) => void = () => {}) {
  if (!aiEnabled()) throw new AiUnavailableError();
  const found = await getTaskWithKey(taskId);
  if (!found) throw new Error(`task ${taskId} not found`);
  const { task, answer: key } = found;

  onStep({ kind: "start", text: "Читаю завдання й добираю правила" });
  const chunks: RuleChunk[] = retrieveRules(task.categoryLabel, `${task.question} ${Object.values(task.options).join(" ")}`);
  const log: string[] = [];
  const wrongAnswers = new Set<string>();
  let searches = 0;
  let answerConfirmed = false;
  let result: { content: ExplanationContent; model: string } | null = null;

  for (let step = 1; step <= MAX_STEPS && wrongAnswers.size < MAX_WRONG && !result; step++) {
    const journal = log.length ? log.map((l, i) => `${i + 1}. ${l}`).join("\n") : "(ще нічого не зроблено)";
    const { data: out, model } = await generateJsonWithModel({
      label: `explain-agent(step ${step})`,
      tier: "main",
      maxTokens: 8000,
      effort: "medium",
      schema: StepSchema,
      prompt: `${INSTRUCTIONS}\n\nДовідка для тебе (не цитуй і не згадуй):\n${formatRules(chunks)}\n\n${renderTask(task)}\n\nЖурнал твоїх дій:\n${journal}\n\nЗалишилось кроків: ${MAX_STEPS - step + 1}. Обери наступну дію.`,
    });
    if (!out) {
      log.push("відповідь не розпізнано, спробуй ще раз");
      continue;
    }

    if (out.action === "search_rules") {
      const query = out.query.trim();
      if (searches >= MAX_SEARCHES || !query) {
        log.push(`search_rules → ${query ? "ліміт пошуку вичерпано" : "порожній запит"}; розв'язуй з тим, що є`);
        continue;
      }
      searches++;
      const found = searchRules(query, new Set(chunks.map((c) => c.id)));
      chunks.push(...found);
      log.push(`search_rules «${query}» → ${found.length ? `додано ${found.length} фрагменти до довідки` : "нічого нового"}`);
      // Student-facing steps stay neutral: failed checks are for the agent's journal, not the student.
      onStep({ kind: "search", text: `Шукаю правило: «${query}»` });
      continue;
    }

    const given = describeAnswer(out, key);
    if (wrongAnswers.has(given)) {
      log.push(`${out.action} ${given} → ти вже перевіряв цю відповідь, вона неправильна`);
      continue;
    }
    const wrong = wrongParts(out, key);
    if (wrong > 0) {
      wrongAnswers.add(given);
      log.push(`${out.action} ${given} → ${answerFeedback(wrong, key)}`);
      onStep({ kind: "check", text: "Перевіряю інші варіанти" });
      continue;
    }
    answerConfirmed = true;

    if (out.action === "check_answer") {
      log.push(`check_answer ${given} → правильно; тепер зроби submit з поясненням`);
      onStep({ kind: "check", ok: true, text: `Відповідь ${given} збіглася з ключем` });
      continue;
    }

    const problems = missingParts(out, task, key);
    if (problems.length) {
      log.push(`submit ${given} → відповідь правильна, але пояснення відхилено: ${problems.join("; ")}`);
      onStep({ kind: "submit", text: "Доповнюю пояснення" });
      continue;
    }
    onStep({ kind: "check", ok: true, text: `Відповідь ${given} збіглася з ключем` });
    result = { content: toContent(out, key), model };
  }

  let status = "verified";
  if (!result) {
    onStep({ kind: "fallback", text: "Звіряюся з правильною відповіддю" });
    result = await explainWithKey(task, key, formatRules(chunks));
    // The key was reached blind, only the write-up failed: still a verified solution.
    if (!answerConfirmed) status = "needs_review";
  }
  onStep({ kind: "done", ok: true, text: "Пояснення готове" });

  const { content, model } = result;
  return prisma.explanation.upsert({
    where: { taskId },
    create: { taskId, content: content as object, status, model },
    update: { content: content as object, status, model },
  });
}
