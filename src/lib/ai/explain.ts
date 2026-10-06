// Explanations verified against the answer key:
// 1) Sonnet solves the task blind (no key) and explains; 2) if its answer matches the key the
// explanation is "verified"; 3) otherwise it is regenerated with the key and marked "needs_review".
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/db";
import { getTaskWithKey } from "@/lib/tasks";
import { formatRules, retrieveRules } from "@/lib/rag";
import type { Answer, ExplanationContent, TaskDTO } from "@/lib/types";
import { AiUnavailableError, aiEnabled, claude, MODEL_MAIN, renderTask, systemBlocks, trackUsage } from "./client";

const WrongOption = z.object({ letter: z.string(), why: z.string() });
const Pair = z.object({ item: z.string(), letter: z.string(), why: z.string() });

const ExplanationSchema = z.object({
  answer: z.string().describe("Літера правильного варіанта (для завдань на відповідність — порожній рядок)"),
  pairs: z.array(Pair).describe("Лише для завдань на відповідність: для кожного пункту 1–4 літера та пояснення"),
  rule: z.string().describe("Правило або норма, на якій ґрунтується завдання, 1–3 речення"),
  ruleRef: z.string().describe("Посилання на параграф Правопису, напр. «§ 7», або порожній рядок, якщо правило не з Правопису"),
  whyCorrect: z.string().describe("Чому правильна відповідь правильна"),
  whyWrong: z.array(WrongOption).describe("Для кожного неправильного (або зайвого) варіанта: чому він не підходить"),
});
type ExplanationOutput = z.infer<typeof ExplanationSchema>;

function matchesKey(out: ExplanationOutput, answer: Answer): boolean {
  if (typeof answer === "string") return out.answer.trim().toUpperCase() === answer;
  return Object.entries(answer).every(([item, letter]) => out.pairs.find((p) => p.item.trim() === item)?.letter.trim() === letter);
}

function toContent(out: ExplanationOutput, answer: Answer): ExplanationContent {
  const content: ExplanationContent = {
    rule: out.rule,
    ruleRef: out.ruleRef.trim() || null,
    whyCorrect: out.whyCorrect,
    whyWrong: Object.fromEntries(out.whyWrong.map((w) => [w.letter.trim(), w.why])),
  };
  if (typeof answer !== "string") content.perItem = Object.fromEntries(out.pairs.map((p) => [p.item.trim(), p.why]));
  return content;
}

async function callExplain(task: TaskDTO, key: Answer | undefined) {
  const rules = formatRules(retrieveRules(task.categoryLabel, `${task.question} ${Object.values(task.options).join(" ")}`));
  const instruction = key
    ? "Поясни це завдання. Правильна відповідь подана в завданні — поясни, чому саме вона правильна, і чому кожен інший варіант неправильний."
    : "Розв'яжи це завдання самостійно, а потім поясни розв'язок: чому правильна відповідь правильна і чому кожен інший варіант неправильний.";
  const res = await (await claude()).messages.parse({
    model: MODEL_MAIN,
    max_tokens: 8000,
    system: systemBlocks,
    output_config: { effort: "medium", format: zodOutputFormat(ExplanationSchema) },
    messages: [
      {
        role: "user",
        content: `${instruction}\n\nФрагменти Українського правопису 2019:\n${rules}\n\n${renderTask(task, key)}`,
      },
    ],
  });
  await trackUsage(key ? "explain(with key)" : "explain(blind)", MODEL_MAIN, res.usage);
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`explain failed: ${res.stop_reason}`);
  return res.parsed_output;
}

export async function generateExplanation(taskId: string) {
  if (!aiEnabled()) throw new AiUnavailableError();
  const found = await getTaskWithKey(taskId);
  if (!found) throw new Error(`task ${taskId} not found`);
  const { task, answer } = found;

  const blind = await callExplain(task, undefined);
  let status = "verified";
  let out = blind;
  if (!matchesKey(blind, answer)) {
    out = await callExplain(task, answer);
    status = "needs_review";
  }
  const content = toContent(out, answer);
  return prisma.explanation.upsert({
    where: { taskId },
    create: { taskId, content: content as object, status, model: MODEL_MAIN },
    update: { content: content as object, status, model: MODEL_MAIN },
  });
}
