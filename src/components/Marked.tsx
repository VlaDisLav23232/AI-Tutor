import type { ReactNode } from "react";

/**
 * The sheet labels passage sentences with five figures. Fixel has no glyphs for them and system fallbacks
 * draw them at mismatched sizes (tiny △, large ◇), so they're drawn as same-size inline SVGs.
 */
const SHAPES: Record<string, { name: string; d: string }> = {
  "△": { name: "трикутник", d: "M8 2.2 14.2 13.3H1.8Z" },
  "◇": { name: "ромб", d: "M8 1.5 14.5 8 8 14.5 1.5 8Z" },
  "□": { name: "квадрат", d: "M2.5 2.5h11v11h-11Z" },
  "○": { name: "коло", d: "M8 2.2a5.8 5.8 0 1 1 0 11.6A5.8 5.8 0 0 1 8 2.2Z" },
  "▽": { name: "перевернутий трикутник", d: "M1.8 2.7h12.4L8 13.8Z" },
};
const SHAPE_RE = /([△◇□○▽])/;

export function Shape({ char }: { char: string }) {
  const s = SHAPES[char];
  if (!s) return <>{char}</>;
  return (
    <svg viewBox="0 0 16 16" role="img" aria-label={s.name} className="inline-block size-[1em] align-[-0.12em]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
      <path d={s.d} />
    </svg>
  );
}

function withShapes(text: string): ReactNode[] {
  return text.split(SHAPE_RE).map((p, i) => (SHAPES[p] ? <Shape key={i} char={p} /> : p));
}

const VOWELS = "аеєиіїоуюя";
const WORD_RE = /([А-ЯІЇЄҐа-яіїєґ'’ʼ-]+)/;

/**
 * Explanations write the stressed vowel as a capital («черговИй», «де-Юре»). Shows it lowercase and underlined instead.
 * Only capitals after the first letter count: the first one may just start a sentence; all-caps words are left alone.
 */
const isStressMark = (ch: string, k: number) => k > 0 && VOWELS.includes(ch.toLowerCase()) && ch !== ch.toLowerCase();
const hasStressMark = (word: string) => word !== word.toUpperCase() && [...word].some(isStressMark);

function withStress(text: string): ReactNode[] {
  return text.split(WORD_RE).flatMap((part, i): ReactNode[] => {
    if (!WORD_RE.test(part) || !hasStressMark(part)) return withShapes(part);
    return [
      <span key={i}>
        {[...part].map((ch, k) =>
          isStressMark(ch, k) ? (
            <span key={k} className="mark-letter">
              {ch.toLowerCase()}
            </span>
          ) : (
            ch
          ),
        )}
      </span>,
    ];
  });
}

/**
 * One ⟦…⟧ fragment. Punctuation and spaces caught inside the mark by the PDF extraction (⟦я,⟧) stay outside it, so a
 * marked letter is always drawn as a letter; marks with digits are extraction debris (⟦04 червня 2026⟧) and drop.
 * In explanations the AI sometimes marks a word that also carries a capitalised stress (⟦фартУх⟧); such a word gets
 * only the letter underline, never both styles at once.
 */
function markNode(inner: string, rich: boolean, key: number): ReactNode {
  const [, lead, core, trail] = /^([^A-Za-zА-ЯІЇЄҐа-яіїєґ]*)([\s\S]*?)([^A-Za-zА-ЯІЇЄҐа-яіїєґ]*)$/.exec(inner)!;
  if (!core || /\d/.test(inner)) return <span key={key}>{withShapes(inner)}</span>;
  const body =
    rich && core.split(WORD_RE).some(hasStressMark) ? (
      withStress(core)
    ) : (
      <span className={[...core].length === 1 ? "mark-letter" : "mark"}>{withShapes(core)}</span>
    );
  return (
    <span key={key}>
      {lead}
      {body}
      {trail}
    </span>
  );
}

function withMarks(text: string, rich: boolean): ReactNode[] {
  return text.split(/(⟦[^⟧]*⟧)/g).map((p, i) =>
    p.startsWith("⟦") ? (
      markNode(p.slice(1, -1), rich, i)
    ) : (
      <span key={i} className="whitespace-pre-line">
        {rich ? withStress(p) : withShapes(p)}
      </span>
    ),
  );
}

/**
 * Renders text where ⟦…⟧ marks the fragments underlined on the exam sheet: a letter is underlined, a longer fragment
 * highlighted. `rich` is for explanations: they use the same two styles, and a capitalised stress («черговИй») is
 * shown lowercase with the letter underlined. Quoted words stay plain — only what the AI marks is highlighted.
 */
export function Marked({ text, className, rich = false }: { text: string; className?: string; rich?: boolean }) {
  return <span className={className}>{withMarks(text, rich)}</span>;
}
