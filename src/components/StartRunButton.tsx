"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RunMode } from "@/lib/types";

export function StartRunButton({
  mode,
  categoryLabel,
  savedKind,
  children,
  variant = "primary",
}: {
  mode: Exclude<RunMode, "practice">;
  categoryLabel?: string;
  savedKind?: "favorite" | "repeat";
  children: React.ReactNode;
  variant?: "primary" | "quiet";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls =
    variant === "primary"
      ? "rounded-xl bg-ink px-6 py-3.5 font-display text-sm font-bold text-on-ink"
      : "rounded-xl border-2 border-ink px-4 py-2 font-display text-sm font-bold hover:bg-paper-2";
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className={`${cls} disabled:opacity-50`}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, categoryLabel, savedKind }) });
          const body = await r.json();
          if (!r.ok) {
            setBusy(false);
            return setError(body.error ?? "Не вдалося почати");
          }
          router.push(`/run/${body.runId}`);
        }}
      >
        {busy ? "Готую…" : children}
      </button>
      {error && <span className="mt-1 text-sm text-bad">{error}</span>}
    </span>
  );
}
