// Loads real NMT 2026 tasks into the DB. Only task fields are used: the source `explanation`
// field is ignored on purpose (explanations are regenerated and verified by AI).
// Safe to re-run: it updates tasks in place and never deletes progress or explanations.
// Run: npx tsx scripts/seed.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { parseInlineOptions, parseMatchingText, stripPageDebris } from "../src/lib/parse";

type RawOption = string | { sentences: string; text: string };
interface RawTask {
  id: string;
  session: string;
  position: number;
  question?: string;
  text?: string;
  passage?: { shape: string; text: string }[];
  options?: Record<string, RawOption>;
  answer: string | string[] | Record<string, string>;
}
interface RawFile {
  groups: { group: string; categories: { label: string; name_ua: string; tasks: RawTask[] }[] }[];
}

// Rare or catch-all categories are excluded from the diagnostic and from mastery-driven picks.
const MIN_TASKS_FOR_DIAGNOSTIC = 5;

function normalizeOption(o: RawOption, hasPassage: boolean): string {
  if (typeof o === "string") return o.trim();
  // The passage above already shows each sentence next to its figure, so the option is just the figures (as on the sheet).
  if (hasPassage) return o.sentences.trim();
  return `${o.sentences}: ${o.text.split(" | ").join("\n")}`.trim();
}

async function main() {
  const raw: RawFile = JSON.parse(readFileSync("materials/nmt_2026_tasks_by_category.json", "utf-8"));

  const tasks: {
    id: string;
    categoryLabel: string;
    format: string;
    position: number;
    session: string;
    question: string;
    passage?: object;
    items?: object;
    options: object;
    answer: string | Record<string, string>;
  }[] = [];
  const categories = new Map<string, { nameUa: string; group: string; count: number }>();
  const skipped: string[] = [];

  for (const g of raw.groups) {
    for (const c of g.categories) {
      categories.set(c.label, { nameUa: c.name_ua, group: g.group, count: 0 });
      for (const t of c.tasks) {
        // Two answers means the collection merged two tasks into one; unusable.
        if (Array.isArray(t.answer)) {
          skipped.push(`${t.id} (two answers)`);
          continue;
        }
        const base = { id: t.id, categoryLabel: c.label, position: t.position, session: t.session };

        if (typeof t.answer === "object") {
          const parsed = t.text ? parseMatchingText(t.text) : null;
          if (!parsed) {
            skipped.push(`${t.id} (matching parse)`);
            continue;
          }
          tasks.push({ ...base, format: "matching", ...parsed, answer: t.answer });
        } else {
          let question = t.question ?? "";
          let options: Record<string, string> | null = null;
          if (t.options) {
            options = Object.fromEntries(Object.entries(t.options).map(([k, v]) => [k, normalizeOption(v, !!t.passage?.length)]));
          } else if (t.text) {
            const parsed = parseInlineOptions(t.text);
            if (parsed) ({ question, options } = parsed);
          }
          if (!options || Object.keys(options).length < 4 || !(t.answer in options)) {
            skipped.push(`${t.id} (options)`);
            continue;
          }
          tasks.push({
            ...base,
            format: c.label === "sentence_order" ? "order" : "single",
            question,
            passage: t.passage,
            options,
            answer: t.answer,
          });
        }
        categories.get(c.label)!.count++;
      }
    }
  }

  // PDF extraction turns the sheet's figures (△ ◇ □ ○ ▽) into Wingdings private-use codes or a combining
  // triangle, which render as junk. Fix them in the source JSON (against the PDF) rather than seeding garbage.
  const junk = tasks.filter((t) => /[\uE000-\uF8FF\u20E4]/u.test(JSON.stringify(t))).map((t) => t.id);
  if (junk.length) throw new Error(`Unrenderable PDF symbols in tasks: ${junk.join(", ")}`);

  // Position statistics, computed from the tasks themselves.
  const sessionsAtPosition = new Map<number, Set<string>>();
  const countAt = new Map<string, Map<number, number>>(); // label → position → count
  for (const t of tasks) {
    if (!sessionsAtPosition.has(t.position)) sessionsAtPosition.set(t.position, new Set());
    sessionsAtPosition.get(t.position)!.add(t.session);
    if (!countAt.has(t.categoryLabel)) countAt.set(t.categoryLabel, new Map());
    const m = countAt.get(t.categoryLabel)!;
    m.set(t.position, (m.get(t.position) ?? 0) + 1);
  }

  // Re-running the seed only upserts tasks and categories: students' answers, progress and the
  // (paid) AI explanations are never deleted.

  // How often each topic appears at each exam position; used to build realistic NMT variants.
  for (const [label, info] of categories) {
    const shares: Record<string, number> = {};
    for (const [pos, n] of countAt.get(label) ?? []) {
      shares[pos] = Math.round((n / sessionsAtPosition.get(pos)!.size) * 1000) / 1000;
    }
    const data = {
      nameUa: info.nameUa,
      group: info.group,
      positionShares: shares,
      inDiagnostic: label !== "other" && info.count >= MIN_TASKS_FOR_DIAGNOSTIC,
    };
    await prisma.category.upsert({ where: { label }, create: { label, ...data }, update: data });
  }

  const clean = (o?: object) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, stripPageDebris(String(v))]));
  for (const t of tasks) {
    const data = {
      ...t,
      question: stripPageDebris(t.question),
      options: clean(t.options)!,
      items: clean(t.items),
      source: "nmt2026",
      verified: true,
    };
    await prisma.task.upsert({ where: { id: t.id }, create: data, update: data });
  }

  console.log(`categories: ${categories.size}`);
  console.log(`tasks: ${tasks.length} (single ${tasks.filter((t) => t.format === "single").length}, order ${tasks.filter((t) => t.format === "order").length}, matching ${tasks.filter((t) => t.format === "matching").length})`);
  console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
