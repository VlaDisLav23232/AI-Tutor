"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type Tone = "primary" | "plain" | "danger";

const TONES: Record<Tone, string> = {
  primary: "bg-ink text-on-ink",
  plain: "border border-grid hover:bg-paper-2",
  danger: "border border-bad/50 text-bad hover:bg-bad/10",
};

function Submit({ label, tone }: { label: string; tone: Tone }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-opacity disabled:opacity-50 ${TONES[tone]}`}>
      {pending ? "…" : label}
    </button>
  );
}

/** A one-button form for a server action. With `confirm`, the first click asks inline instead of a browser popup. */
export function ActionButton({
  action,
  fields,
  label,
  tone = "plain",
  confirm,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  tone?: Tone;
  confirm?: string;
}) {
  const [asking, setAsking] = useState(false);

  if (confirm && !asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${TONES[tone]}`}>
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {asking && <span className="text-sm text-ink-soft">{confirm}</span>}
      <Submit label={asking ? "Так" : label} tone={tone} />
      {asking && (
        <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-paper-2">
          Ні
        </button>
      )}
    </form>
  );
}
