// Scratch harness: regenerates explanations for the given task ids and prints them. Not part of the app.
import "dotenv/config";
import { prisma } from "./src/lib/db";
import { generateExplanation } from "./src/lib/ai/explain";
import { aiSpentUsd, renderTask } from "./src/lib/ai/client";
import { getTaskWithKey } from "./src/lib/tasks";
import type { ExplanationContent } from "./src/lib/types";

async function one(id: string): Promise<string> {
  const found = (await getTaskWithKey(id))!;
  const steps: string[] = [];
  const t0 = Date.now();
  const e = await generateExplanation(id, (s) => steps.push(`${s.kind}${s.ok ? "✓" : ""}: ${s.text}`));
  const c = e.content as unknown as ExplanationContent;
  return [
    `\n================ ${id} [${found.task.categoryLabel}] status=${e.status} model=${e.model} ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    renderTask(found.task, found.answer),
    `steps: ${steps.join(" | ")}`,
    `--- ПРАВИЛО:\n${c.rule ?? "(немає)"}`,
    ...c.options.map((o) => `--- ${o.letter}${o.correct ? " ✓" : ""}: ${o.why}`),
    ...c.items.map((p) => `--- ${p.item} — ${p.letter}, бо ${p.why}`),
    `--- takeaway: ${c.takeaway ?? "—"}`,
  ].join("\n");
}

async function main() {
  const ids = process.argv.slice(2);
  const before = await aiSpentUsd();
  const out: string[] = [];
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          out.push(await one(id));
        } catch (err) {
          out.push(`\n================ ${id} FAILED: ${err instanceof Error ? err.message : err}`);
        }
      }
    }),
  );
  console.log(out.join("\n"));
  console.log(`\nspent this run: $${((await aiSpentUsd()) - before).toFixed(4)}`);
}

main().finally(() => prisma.$disconnect());
