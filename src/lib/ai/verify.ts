// Blind solve by a second model: a generated task is kept only if Haiku reaches the same key.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Answer, TaskDTO } from "@/lib/types";
import { claude, MODEL_FAST, renderTask, systemBlocks, trackUsage } from "./client";

const SolveSchema = z.object({
  answer: z.string().describe("Літера правильного варіанта; для завдань на відповідність — порожній рядок"),
  pairs: z.array(z.object({ item: z.string(), letter: z.string() })).describe("Лише для відповідностей: пункт 1–4 → літера"),
});

export async function blindSolveMatches(task: TaskDTO, key: Answer): Promise<boolean> {
  const res = await (await claude()).messages.parse({
    model: MODEL_FAST,
    max_tokens: 2000,
    system: systemBlocks,
    output_config: { format: zodOutputFormat(SolveSchema) },
    messages: [{ role: "user", content: `Розв'яжи завдання НМТ з української мови.\n\n${renderTask(task)}` }],
  });
  await trackUsage("verify", MODEL_FAST, res.usage);
  const out = res.parsed_output;
  if (!out) return false;
  if (typeof key === "string") return out.answer.trim().toUpperCase() === key;
  return Object.entries(key).every(([item, letter]) => out.pairs.find((p) => p.item.trim() === item)?.letter.trim() === letter);
}
