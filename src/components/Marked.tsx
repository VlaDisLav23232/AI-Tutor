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

/** Renders source text where ⟦…⟧ marks the fragments underlined on the exam sheet. */
export function Marked({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("⟦") ? (
          <span key={i} className="mark">
            {withShapes(p.slice(1, -1))}
          </span>
        ) : (
          <span key={i} className="whitespace-pre-line">
            {withShapes(p)}
          </span>
        ),
      )}
    </span>
  );
}
