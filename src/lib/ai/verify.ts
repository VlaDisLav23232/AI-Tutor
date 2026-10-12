// Blind solve by a second model: a generated task is kept only if the fast model reaches the same key.
import { z } from "zod";
import type { Answer, TaskDTO } from "@/lib/types";
import { generateJson, renderTask } from "./client";

const SolveSchema = z.object({
  answer: z.string().describe("Літера правильного варіанта; для завдань на відповідність — порожній рядок"),
  pairs: z.array(z.object({ item: z.string(), letter: z.string() })).describe("Лише для відповідностей: пункт 1–4 → літера"),
});

export async function blindSolveMatches(task: TaskDTO, key: Answer): Promise<boolean> {
  const out = await generateJson({
    label: "verify",
    tier: "fast",
    maxTokens: 2000,
    schema: SolveSchema,
    prompt: `Розв'яжи завдання НМТ з української мови.\n\n${renderTask(task)}`,
  });
  if (!out) return false;
  if (typeof key === "string") return out.answer.trim().toUpperCase() === key;
  return Object.entries(key).every(([item, letter]) => out.pairs.find((p) => p.item.trim() === item)?.letter.trim() === letter);
}
