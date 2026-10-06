"use client";

import { Marked, Shape } from "@/components/Marked";
import type { Answer, TaskDTO } from "@/lib/types";

export type Response = string | Record<string, string> | null;

interface Props {
  task: TaskDTO;
  value: Response;
  onChange: (v: Response) => void;
  /** After checking: the key, to colour the sheet. */
  answer?: Answer | null;
  locked?: boolean;
}

/** One answer-sheet cell. Marked with ✕ like on the real NMT form; coloured after checking. */
function Cell({
  label,
  marked,
  state,
  onClick,
  disabled,
  ariaLabel,
  compact = false,
}: {
  /** Smaller on desktop (pointer input); phones keep the 44px touch target. */
  compact?: boolean;
  label?: string;
  marked: boolean;
  state: "none" | "right" | "wrong" | "missed";
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const look =
    state === "right"
      ? "border-good bg-good text-white"
      : state === "wrong"
        ? "border-bad bg-bad/10"
        : state === "missed"
          ? "border-good text-good"
          : marked
            ? "border-ink bg-ink/5"
            : "border-ink-soft";
  const showCheck = state === "right" || state === "missed";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={marked}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid size-11 shrink-0 place-items-center rounded-lg border-2 font-display text-sm transition-colors ${compact ? "md:size-9" : ""} ${look} ${disabled ? "cursor-default" : "hover:bg-paper-2"}`}
    >
      {label && <span className={marked || showCheck ? "opacity-0" : "text-ink-soft"}>{label}</span>}
      {showCheck ? (
        <svg viewBox="0 0 24 24" className="draw-check absolute size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        marked && (
          <span aria-hidden className={`absolute inset-0 grid place-items-center text-2xl leading-none ${state === "wrong" ? "text-bad" : "text-ink"}`}>
            ✕
          </span>
        )
      )}
    </button>
  );
}

function cellState(letter: string, chosen: boolean, key: string | undefined) {
  if (!key) return "none" as const;
  if (letter === key) return chosen ? ("right" as const) : ("missed" as const);
  return chosen ? ("wrong" as const) : ("none" as const);
}

function SingleChoice({ task, value, onChange, answer, locked }: Props) {
  const key = typeof answer === "string" ? answer : undefined;
  return (
    <ul className="mt-5 space-y-2">
      {Object.entries(task.options).map(([letter, text]) => {
        const chosen = value === letter;
        const state = cellState(letter, chosen, key);
        return (
          <li key={letter}>
            <label className={`flex items-start gap-3 rounded-md p-1.5 ${locked ? "" : "cursor-pointer hover:bg-paper-2"}`}>
              <Cell
                label={letter}
                marked={chosen}
                state={state}
                disabled={locked}
                onClick={() => onChange(letter)}
                ariaLabel={`Варіант ${letter}`}
              />
              <span className="pt-2 text-[17px]">
                <Marked text={text} />
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Matching({ task, value, onChange, answer, locked }: Props) {
  const resp = (value ?? {}) as Record<string, string>;
  const key = answer && typeof answer === "object" ? answer : undefined;
  const items = task.items ?? {};
  const letters = Object.keys(task.options);
  // Desktop: numbered items on the left; lettered options with the answer grid right under them,
  // so the whole task fits one screen. Phones: everything stacks.
  return (
    <div className="mt-4 grid gap-5 md:grid-cols-2 md:gap-8">
      <ol className="space-y-1.5">
        {Object.entries(items).map(([n, text]) => (
          <li key={n} className="flex gap-2 text-[16px] leading-snug">
            <span className="font-display font-bold">{n}</span>
            <Marked text={text} />
          </li>
        ))}
      </ol>
      <div className="space-y-4">
        <ul className="space-y-1.5">
          {Object.entries(task.options).map(([l, text]) => (
            <li key={l} className="flex gap-2 text-[16px] leading-snug">
              <span className="font-display font-bold">{l}</span>
              <Marked text={text} />
            </li>
          ))}
        </ul>

        {/* The answer grid, as on the NMT sheet: one mark per row. */}
        <div className="inline-block rounded-md border border-grid p-2.5">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `1.5rem repeat(${letters.length}, auto)` }}>
            <span />
            {letters.map((l) => (
              <span key={l} className="text-center font-display text-sm">
                {l}
              </span>
            ))}
            {Object.keys(items).map((n) => (
              <div key={n} className="contents">
                <span className="self-center font-display text-sm font-bold">{n}</span>
                {letters.map((l) => {
                  const chosen = resp[n] === l;
                  return (
                    <Cell
                      key={l}
                      compact
                      marked={chosen}
                      state={cellState(l, chosen, key?.[n])}
                      disabled={locked}
                      onClick={() => onChange({ ...resp, [n]: l })}
                      ariaLabel={`Пункт ${n}, варіант ${l}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskView(props: Props) {
  const { task } = props;
  return (
    <div>
      {task.passage && (
        <div className="mb-5 space-y-1.5 rounded-md bg-paper-2 p-4 text-[16px]">
          {task.passage.map((s, i) => (
            <p key={i}>
              <span className="mr-2">
                <Shape char={s.shape} />
              </span>
              <Marked text={s.text} />
            </p>
          ))}
        </div>
      )}
      <p className="text-[18px] font-semibold leading-snug">
        <Marked text={task.question} />
      </p>
      {task.format === "matching" ? <Matching {...props} /> : <SingleChoice {...props} />}
    </div>
  );
}

export function isComplete(task: TaskDTO, value: Response): boolean {
  if (task.format === "matching") {
    const r = (value ?? {}) as Record<string, string>;
    return Object.keys(task.items ?? {}).every((n) => r[n]);
  }
  return typeof value === "string";
}
