// Precomputes verified AI explanations for all real tasks (cached in the Explanation table).
// Each task: Sonnet solves blind → matches key = "verified", else re-explained with key = "needs_review".
// Costs about $0.02–0.03 per task (one or two Sonnet calls), and stops at the AI_BUDGET_USD cap.
// Run: npx tsx scripts/gen-explanations.ts --limit N [--force]
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { generateExplanation } from "../src/lib/ai/explain";
import { aiEnabled, aiSpentUsd, AI_BUDGET_USD } from "../src/lib/ai/client";

const CONCURRENCY = 5;

async function main() {
  if (!aiEnabled()) throw new Error("Set ANTHROPIC_API_KEY in .env first");
  const args = process.argv.slice(2);
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;
  const force = args.includes("--force");
  if (!limit) {
    const missing = await prisma.task.count({ where: { source: "nmt2026", explanation: null } });
    console.log(`${missing} tasks have no explanation yet; all of them would cost roughly $${(missing * 0.02).toFixed(0)}–${(missing * 0.03).toFixed(0)}.`);
    console.log("Pass --limit N to explain only N tasks. Otherwise explanations are generated only when a student presses «Пояснити (AI)».");
    return;
  }

  const tasks = await prisma.task.findMany({
    where: { source: "nmt2026", ...(force ? {} : { explanation: null }) },
    select: { id: true },
    orderBy: { id: "asc" },
    take: limit,
  });
  console.log(`explaining ${tasks.length} tasks…`);

  let done = 0;
  let verified = 0;
  const failed: string[] = [];
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          const e = await generateExplanation(t.id);
          if (e.status === "verified") verified++;
        } catch (err) {
          failed.push(t.id);
          console.error(t.id, err instanceof Error ? err.message : err);
        }
        done++;
        if (done % 10 === 0) console.log(`${done}/${tasks.length} (verified ${verified})`);
      }
    }),
  );

  console.log(`AI spend so far: $${(await aiSpentUsd()).toFixed(2)} of $${AI_BUDGET_USD} cap`);
  console.log(`done: ${done}, verified: ${verified}, needs_review: ${done - verified - failed.length}, failed: ${failed.length}`);
  if (failed.length) console.log(`failed ids: ${failed.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
