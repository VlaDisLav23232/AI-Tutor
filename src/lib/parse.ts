// Parsers for tasks whose items/options are flattened into one `text` string in the source JSON.

import { LETTERS } from "./types";

/** Index of the first `token` surrounded by whitespace (or string start) at or after `from`. */
function findToken(text: string, token: string, from: number): number {
  const re = new RegExp(`(?:^|\\s)${token}\\s`, "g");
  // Start one char early so a token sitting exactly at `from` still sees its leading space.
  re.lastIndex = Math.max(0, from - 1);
  const m = re.exec(text);
  if (!m) return -1;
  return m.index + (m[0].startsWith(token) ? 0 : 1);
}

/** Index of the last whitespace-delimited `token` that starts before `before`. */
function findTokenBackward(text: string, token: string, before: number, after: number): number {
  let best = -1;
  let i = after;
  for (;;) {
    const idx = findToken(text, token, i);
    if (idx === -1 || idx >= before) break;
    best = idx;
    i = idx + 1;
  }
  return best;
}

/**
 * Splits trailing options "А … Б … В … Г … [Д …]" off `text`, searching after `from`.
 * Options are chained backwards from the end so that letters inside the stem are ignored.
 */
function splitOptions(text: string, from: number, count: 4 | 5) {
  const letters = LETTERS.slice(0, count);
  const starts: number[] = [];
  let before = text.length;
  for (let k = letters.length - 1; k >= 0; k--) {
    const idx = findTokenBackward(text, letters[k], before, from);
    if (idx === -1) return null;
    starts[k] = idx;
    before = idx;
  }
  const options: Record<string, string> = {};
  letters.forEach((l, k) => {
    const end = k + 1 < letters.length ? starts[k + 1] : text.length;
    options[l] = text.slice(starts[k] + l.length, end).trim();
  });
  if (Object.values(options).some((o) => !o)) return null;
  return { start: starts[0], options };
}

/**
 * Removes page-header debris the PDF extraction glued onto task text:
 * "… фарт⟦у⟧х ⟦04 червня 2026⟧", "… ⟦23 травня 2026⟧ 5", "… ЩОДЕННИК АБІТУРІЄНТА".
 */
export function stripPageDebris(text: string): string {
  return text
    .replace(/\s*⟦?\s*\d{1,2}\s+(?:травня|червня)\s+2026\s*⟧?(?:\s+\d{1,3})?\s*$/u, "")
    .replace(/\s*ЩОДЕННИК АБІТУРІЄНТА.*$/u, "")
    .trim();
}

/** Moves option letters / item numbers that the PDF extraction trapped inside highlights: "⟦Б д⟧" → "Б ⟦д⟧". */
function normalize(text: string): string {
  return text
    .replace(/⟦([АБВГД1-4]) /g, "$1 ⟦")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Instruction 1 … 2 … А … 3 … Б …" → parts, or null if the shape doesn't match.
 * Items (1–4) and options (А–Д) may be interleaved because the source was extracted from a
 * two-column PDF, so we walk both sequences at once and cut at whichever marker comes next.
 */
export function parseMatchingText(text: string) {
  const t = normalize(text);
  const numbers = ["1", "2", "3", "4"];
  const letters = [...LETTERS];
  const marks: { key: string; kind: "item" | "option"; at: number }[] = [];
  let ni = 0;
  let li = 0;
  let cursor = 0;
  while (ni < numbers.length || li < letters.length) {
    const nAt = ni < numbers.length ? findToken(t, numbers[ni], cursor) : -1;
    // Options only start after item 1.
    const lAt = li < letters.length && ni > 0 ? findToken(t, letters[li], cursor) : -1;
    if (nAt === -1 && lAt === -1) break;
    if (lAt === -1 || (nAt !== -1 && nAt < lAt)) {
      marks.push({ key: numbers[ni++], kind: "item", at: nAt });
      cursor = nAt + 1;
    } else {
      marks.push({ key: letters[li++], kind: "option", at: lAt });
      cursor = lAt + 1;
    }
  }
  if (ni < 4 || li < 4) return parseNumberedWords(t);
  const items: Record<string, string> = {};
  const options: Record<string, string> = {};
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].at : t.length;
    // Drop page-number debris like "… смітник. 8 ⟦ВІ⟧" left by the PDF extraction.
    const body = t
      .slice(m.at + m.key.length, end)
      .trim()
      .replace(/\s\d+\s⟦[^⟧]*⟧$/, "");
    (m.kind === "item" ? items : options)[m.key] = body;
  });
  if ([...Object.values(items), ...Object.values(options)].some((v) => !v)) return parseNumberedWords(t);
  return { question: t.slice(0, marks[0].at).trim(), items, options };
}

/** "Question А … Б … В … Г …" → parts, or null. Used for single-choice tasks stored as raw text. */
export function parseInlineOptions(text: string) {
  const t = normalize(text);
  for (const count of [5, 4] as const) {
    // Options start at the first "А" after which the full letter chain exists.
    let from = 0;
    for (;;) {
      const a = findToken(t, "А", from);
      if (a === -1) break;
      const opts = splitOptions(t, a, count);
      if (opts && opts.start === a) return { question: t.slice(0, a).trim(), options: opts.options };
      from = a + 1;
    }
  }
  return null;
}

/**
 * Parts-of-speech variant: "… ⟦(1)всім, (2)навіть⟧ … (4)майбутнє … А іменник Б займенник …".
 * Items are the words right after "(N)"; the whole sentence stays in the question.
 */
function parseNumberedWords(t: string) {
  const items: Record<string, string> = {};
  for (const n of ["1", "2", "3", "4"]) {
    const m = new RegExp(`\\(${n}\\)([^\\s⟧,.;:!?]+)`).exec(t);
    if (!m) return null;
    items[n] = m[1];
  }
  const afterLast = t.indexOf("(4)");
  const opts = splitOptions(t, afterLast, 5) ?? splitOptions(t, afterLast, 4);
  if (!opts) return null;
  return { question: t.slice(0, opts.start).trim(), items, options: opts.options };
}
