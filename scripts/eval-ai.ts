// Quality report for the AI layer:
//  1) share of cached explanations that agreed with the key on a blind solve (target ≥ 90%),
//     with the breakdown per category so weak topics are visible;
//  2) pass rate of the generate → blind-verify pipeline for a few categories;
//  3) a few random explanations printed for a human to read.
// Run: npx tsx scripts/eval-ai.ts [--generate N]
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { aiEnabled } from "../src/lib/ai/client";
import { generateForCategory } from "../src/lib/ai/generate";
import type { ExplanationContent } from "../src/lib/types";

async function explanationReport() {
  const rows = await prisma.explanation.findMany({ include: { task: true }, where: { task: { source: "nmt2026" } } });
  const total = await prisma.task.count({ where: { source: "nmt2026" } });
  if (!rows.length) return console.log("No explanations yet — run scripts/gen-explanations.ts first.");
  const verified = rows.filter((r) => r.status === "verified").length;
  console.log(`\nExplanations: ${rows.length}/${total} tasks covered, ${verified} verified (${((verified / rows.length) * 100).toFixed(1)}%)`);

  const byCat = new Map<string, { v: number; n: number }>();
  for (const r of rows) {
    const c = byCat.get(r.task.categoryLabel) ?? { v: 0, n: 0 };
    c.n++;
    if (r.status === "verified") c.v++;
    byCat.set(r.task.categoryLabel, c);
  }
  console.log("\nAgreement with the key per category (worst first):");
  [...byCat.entries()]
    .sort((a, b) => a[1].v / a[1].n - b[1].v / b[1].n)
    .forEach(([label, c]) => console.log(`  ${label.padEnd(40)} ${c.v}/${c.n}`));

  console.log("\nRandom explanations to read:");
  for (const r of rows.sort(() => Math.random() - 0.5).slice(0, 3)) {
    const c = r.content as unknown as ExplanationContent;
    console.log(`\n[${r.task.id}] ${r.task.question}\n  key: ${JSON.stringify(r.task.answer)} (${r.status})\n  rule: ${c.rule} ${c.ruleRef ?? ""}\n  why: ${c.whyCorrect}`);
  }
}

async function generationReport(n: number) {
  if (!aiEnabled()) return console.log("\nSkipping generation check: ANTHROPIC_API_KEY not set.");
  console.log(`\nGeneration (${n} per category): saved = passed the blind Haiku check`);
  for (const label of ["phraseology_matching", "lexical_error", "doubled_letters", "punctuation_error"]) {
    const parents = await prisma.task.findMany({ where: { categoryLabel: label, source: "nmt2026" }, take: n });
    let ok = 0;
    for (const p of parents) if (await generateForCategory(label, p).catch(() => null)) ok++;
    console.log(`  ${label.padEnd(40)} ${ok}/${parents.length}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const n = args.includes("--generate") ? Number(args[args.indexOf("--generate") + 1]) : 0;
  await explanationReport();
  if (n > 0) await generationReport(n);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
