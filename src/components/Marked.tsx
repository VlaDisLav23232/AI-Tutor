/** Renders source text where ⟦…⟧ marks the fragments underlined on the exam sheet. */
export function Marked({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("⟦") ? (
          <span key={i} className="mark">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i} className="whitespace-pre-line">
            {p}
          </span>
        ),
      )}
    </span>
  );
}
