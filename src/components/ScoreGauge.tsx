"use client";

import { useEffect, useState } from "react";
import { LEVEL_BOUNDS, LEVEL_LABEL, level, type Level } from "@/lib/scoring";

export const LEVEL_TEXT: Record<Level, string> = { weak: "text-lvl-weak", ok: "text-lvl-ok", strong: "text-lvl-strong" };
export const LEVEL_BG: Record<Level, string> = { weak: "bg-lvl-weak", ok: "bg-lvl-ok", strong: "bg-lvl-strong" };

const pct = (score: number) => Math.min(100, Math.max(0, score - 100));

/** Animates a number from `from` to `to` (skipped when the user prefers reduced motion). */
export function useCountUp(to: number, from: number = to, ms = 900): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return value;
}

/**
 * Knowledge on the NMT 100–200 scale: a track with the three level zones, a filled bar and the number.
 * With `from`, it animates from the previous score (used after an answer in practice).
 */
export function ScoreGauge({
  score,
  from,
  size = "md",
  showLabel = true,
}: {
  score: number | null;
  from?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const shown = useCountUp(score ?? 100, from ?? score ?? 100);
  if (score === null) {
    return (
      <div className={size === "sm" ? "" : "space-y-2"}>
        {size !== "sm" && <p className="font-display text-sm text-ink-soft">Ще не перевірено</p>}
        <div className={`${size === "lg" ? "h-4" : size === "md" ? "h-3" : "h-2"} rounded-full border border-dashed border-grid`} />
      </div>
    );
  }
  const lvl = level(shown);
  const track = size === "lg" ? "h-4" : size === "md" ? "h-3" : "h-2";
  return (
    <div className="w-full">
      {size !== "sm" && (
        <div className="mb-2 flex items-baseline gap-2">
          <span className={`font-display font-bold tabular-nums ${size === "lg" ? "text-5xl" : "text-2xl"}`}>{shown}</span>
          {showLabel && <span className={`text-sm font-semibold ${LEVEL_TEXT[lvl]}`}>{LEVEL_LABEL[lvl]}</span>}
        </div>
      )}
      <div className={`relative ${track} overflow-hidden rounded-full bg-paper-2`} role="meter" aria-valuemin={100} aria-valuemax={200} aria-valuenow={shown} aria-label="Бал за темою">
        {/* Zone boundaries at 140 and 170 */}
        <span className="absolute inset-y-0 w-px bg-grid" style={{ left: `${LEVEL_BOUNDS.ok - 100}%` }} />
        <span className="absolute inset-y-0 w-px bg-grid" style={{ left: `${LEVEL_BOUNDS.strong - 100}%` }} />
        <span className={`absolute inset-y-0 left-0 rounded-full ${LEVEL_BG[lvl]}`} style={{ width: `${Math.max(3, pct(shown))}%` }} />
      </div>
      {size === "lg" && (
        <div className="relative mt-1 h-4 text-xs text-ink-soft tabular-nums">
          <span className="absolute left-0">100</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${LEVEL_BOUNDS.ok - 100}%` }}>
            {LEVEL_BOUNDS.ok}
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: `${LEVEL_BOUNDS.strong - 100}%` }}>
            {LEVEL_BOUNDS.strong}
          </span>
          <span className="absolute right-0">200</span>
        </div>
      )}
    </div>
  );
}
