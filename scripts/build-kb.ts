// Builds the knowledge base used for deterministic task generation:
//   src/data/kb-stress.json   — words with their correct stress (from materials/Наголоси.md)
//   src/data/kb-idioms.json   — idiom → meaning (from materials/фразеологізми.md)
//   src/data/kb-foreign.json  — foreign word → Ukrainian equivalent (from real tasks + answers)
// Run: npx tsx scripts/build-kb.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VOWELS = "аеєиіїоуюя";

export interface StressWord {
  word: string; // lowercase
  stressed: number[]; // indices of vowels that may carry the stress (2 = both variants allowed)
  note?: string; // e.g. "у множині"
}

function parseStressForm(form: string, note?: string): StressWord | null {
  const stressed: number[] = [];
  [...form].forEach((ch, i) => {
    if (VOWELS.includes(ch.toLowerCase()) && ch !== ch.toLowerCase()) stressed.push(i);
  });
  const word = form.toLowerCase();
  const vowelCount = [...word].filter((c) => VOWELS.includes(c)).length;
  // Single-vowel words carry no information; words without a marked vowel are typos.
  if (!stressed.length || vowelCount < 2) return null;
  return { word, stressed, ...(note ? { note } : {}) };
}

function buildStress(): StressWord[] {
  const out: StressWord[] = [];
  for (const raw of readFileSync("materials/Наголоси.md", "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("*")) continue;
    let body = line.replace(/^\*\s*/, "").trim();
    let note: string | undefined;
    const m = /\(([^)]+)\)\s*$/.exec(body);
    if (m) {
      note = m[1];
      body = body.slice(0, m.index).trim();
    }
    for (const form of body.split(/,\s*/)) {
      const w = parseStressForm(form.trim(), note);
      if (w) out.push(w);
    }
  }
  return out;
}

function buildIdioms() {
  const out: { idiom: string; meaning: string }[] = [];
  for (const raw of readFileSync("materials/фразеологізми.md", "utf-8").split(/\r?\n/)) {
    const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(raw.trim());
    if (!m) continue;
    const idiom = m[1].replace(/\s*[–—-]\s*$/, "").trim();
    const meaning = m[2].replace(/^[–—-]\s*/, "").trim();
    if (idiom && meaning) out.push({ idiom: idiom[0].toLowerCase() + idiom.slice(1), meaning });
  }
  return out;
}

function buildForeign() {
  const raw = JSON.parse(readFileSync("materials/nmt_2026_tasks_by_category.json", "utf-8"));
  const out = new Map<string, { word: string; equivalent: string; distractors: string[] }>();
  for (const g of raw.groups)
    for (const c of g.categories) {
      if (c.label !== "foreign_word_equivalent") continue;
      for (const t of c.tasks) {
        const m = /слова\s+([А-ЯҐЄІЇʼ'’-]{3,})/.exec(t.question ?? "");
        if (!m || typeof t.answer !== "string" || !t.options) continue;
        const opts = t.options as Record<string, string>;
        if (typeof opts[t.answer] !== "string") continue;
        out.set(m[1], {
          word: m[1].toLowerCase(),
          equivalent: opts[t.answer].trim(),
          distractors: Object.entries(opts)
            .filter(([k, v]) => k !== t.answer && typeof v === "string" && v.length < 40)
            .map(([, v]) => v.trim()),
        });
      }
    }
  return [...out.values()];
}

mkdirSync("src/data", { recursive: true });
const stress = buildStress();
const idioms = buildIdioms();
const foreign = buildForeign();
writeFileSync("src/data/kb-stress.json", JSON.stringify(stress, null, 1));
writeFileSync("src/data/kb-idioms.json", JSON.stringify(idioms, null, 1));
writeFileSync("src/data/kb-foreign.json", JSON.stringify(foreign, null, 1));
console.log(`stress words: ${stress.length}, idioms: ${idioms.length}, foreign words: ${foreign.length}`);
