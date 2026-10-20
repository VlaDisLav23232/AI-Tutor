// Grounding for explanations from the local knowledge base (no AI): mnemonics (kb-mnemonics.json), the official
// stress list (kb-stress.json) and idiom meanings (kb-idioms.json). Also checks stress marks the model writes, and
// explains a stress task with no AI at all when every marked word is in the official list.
import mnemonics from "@/data/kb-mnemonics.json";
import stressKb from "@/data/kb-stress.json";
import idiomKb from "@/data/kb-idioms.json";
import type { Answer, ExplanationContent, OptionVerdict } from "./types";

interface Mnemonic {
  id: string;
  categories: string[];
  /** Offered only when the task contains one of these words; without words it applies to the whole topic. */
  words?: string[];
  text: string;
}
type StressWord = { word: string; stressed: number[]; note?: string };

/** The parts of a task the hints look at. */
export interface TaskText {
  categoryLabel: string;
  question: string;
  options: Record<string, string>;
  items?: Record<string, string> | null;
  passage?: { text: string }[] | null;
}

const VOWELS = "аеєиіїоуюя";
const norm = (s: string) => s.toLowerCase().replace(/[’ʼ`]/g, "'");
const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));

function tokens(text: string): string[] {
  return norm(text.replace(/[⟦⟧]/g, "")).match(/[а-яіїєґ'-]+/g) ?? [];
}

function taskTokens(t: TaskText): string[] {
  const parts = [t.question, ...Object.values(t.options), ...Object.values(t.items ?? {}), ...(t.passage ?? []).map((p) => p.text)];
  return [...new Set(parts.flatMap(tokens))];
}

const mentions = (toks: string[], word: string) => {
  const s = stem(norm(word));
  return toks.some((t) => t.startsWith(s));
};

/** Mnemonics for this task: ones triggered by its words first, then general ones for its topic. */
export function findHints(t: TaskText, limit = 3): string[] {
  const toks = taskTokens(t);
  const forTopic = (mnemonics as Mnemonic[]).filter((m) => m.categories.includes(t.categoryLabel));
  const triggered = forTopic.filter((m) => m.words?.length && m.words.some((w) => mentions(toks, w)));
  const general = forTopic.filter((m) => !m.words?.length);
  return [...triggered, ...general].slice(0, limit).map((m) => m.text);
}

// ---------- Stress ----------

const stressIndex = new Map<string, StressWord[]>();
for (const w of stressKb as StressWord[]) stressIndex.set(norm(w.word), [...(stressIndex.get(norm(w.word)) ?? []), w]);

const withStress = (w: StressWord) => [...w.word].map((ch, i) => (w.stressed.includes(i) ? ch.toUpperCase() : ch)).join("");
const showEntry = (w: StressWord) => withStress(w) + (w.note ? ` (${w.note})` : "");

/** Official-list entries for the words of a stress task, e.g. "добовИй, вИгода (користь)", for the model. */
export function stressFacts(t: TaskText, limit = 20): string[] {
  const toks = taskTokens(t);
  const found = [...stressIndex.values()].flat().filter((w) => mentions(toks, w.word));
  return found.slice(0, limit).map(showEntry);
}

/**
 * Words in `text` written with a capitalised stressed vowel that contradicts the official list
 * (e.g. «добОвий»). The first letter is ignored: it may be capitalised just because it starts a sentence.
 */
export function stressMistakes(text: string): string[] {
  const bad: string[] = [];
  for (const token of text.match(/[А-ЯІЇЄҐа-яіїєґ'’ʼ-]+/g) ?? []) {
    if (token.length < 2 || token === token.toUpperCase()) continue;
    const marked = [...token].flatMap((ch, i) => (i > 0 && VOWELS.includes(ch.toLowerCase()) && ch !== ch.toLowerCase() ? [i] : []));
    const entries = stressIndex.get(norm(token));
    if (!marked.length || !entries) continue;
    const allowed = new Set(entries.flatMap((e) => e.stressed));
    if (marked.some((i) => !allowed.has(i))) bad.push(token);
  }
  return bad;
}

/** Mnemonics from the library that mention any of `words`. */
function stressHintsFor(words: string[]): string[] {
  return (mnemonics as Mnemonic[])
    .filter((m) => m.categories.includes("stress") && m.words?.some((w) => words.some((x) => x.startsWith(stem(norm(w))))))
    .map((m) => m.text);
}

interface MarkedWord {
  word: string;
  index: number;
}

/** Words in an option with one marked letter, e.g. "добов⟦і⟧" → {word: "добові", index: 5}. */
function markedWords(option: string): MarkedWord[] {
  const out: MarkedWord[] = [];
  for (const m of option.matchAll(/([а-яіїєґА-ЯІЇЄҐ'’ʼ-]*)⟦([^⟧])⟧([а-яіїєґА-ЯІЇЄҐ'’ʼ-]*)/g)) {
    out.push({ word: norm(m[1] + m[2] + m[3]), index: m[1].length });
  }
  return out;
}

/**
 * A stress task explained straight from the official list: every row is checked word by word.
 * Returns null (so the AI explains it) when a marked word is not in the list as written (e.g. an inflected form)
 * or the result does not agree with the key.
 */
export function explainStressFromKb(t: Pick<TaskText, "question" | "options">, key: Answer): ExplanationContent | null {
  if (typeof key !== "string") return null;
  const rows = Object.entries(t.options).map(([letter, text]) => {
    const words = markedWords(text);
    const checked = words.map((w) => {
      const entries = stressIndex.get(w.word);
      const match = entries?.find((e) => e.stressed.includes(w.index));
      return { ...w, entries, ok: Boolean(match), shown: match ? withStress(match) : entries?.map(showEntry).join(" / ") };
    });
    return { letter, checked };
  });
  if (rows.some((r) => !r.checked.length || r.checked.some((w) => !w.entries))) return null;

  // "…ОКРІМ рядка": the answer is the row with a mistake; otherwise it is the only fully correct row.
  const wantsMistake = /ОКРІМ/.test(t.question);
  const matching = rows.filter((r) => r.checked.every((w) => w.ok) !== wantsMistake);
  if (matching.length !== 1 || matching[0].letter !== key) return null;

  const options: OptionVerdict[] = rows.map((r) => {
    const wrong = r.checked.filter((w) => !w.ok);
    const why = wrong.length
      ? `Тут помилка: правильно ${wrong.map((w) => w.shown).join(", ")}.`
      : `Усі наголоси правильні: ${r.checked.map((w) => w.shown).join(", ")}.`;
    return { letter: r.letter, correct: r.letter === key, why };
  });
  const wrongWords = rows.flatMap((r) => r.checked.filter((w) => !w.ok).map((w) => w.word));
  return { v: 2, options, items: [], takeaway: stressHintsFor(wrongWords)[0] ?? null };
}

// ---------- Phraseology ----------

const idiomIndex = new Map((idiomKb as { idiom: string; meaning: string }[]).map((i) => [norm(i.idiom), i.meaning]));

/** "idiom — meaning" for the task's options found in the idiom list. */
export function idiomMeanings(t: TaskText): string[] {
  return Object.values(t.options).flatMap((o) => {
    const meaning = idiomIndex.get(norm(o).replace(/[.,;:!?…«»"]/g, "").trim());
    return meaning ? [`${o.trim()} — ${meaning}`] : [];
  });
}
