"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TopicRow } from "@/lib/dashboard";
import { shortName } from "@/lib/topicName";
import { LEVEL_TEXT, ScoreGauge } from "./ScoreGauge";

/** A topic as a compact tile; tapping it starts a 10-task test on that topic. */
export function TopicTile({ topic }: { topic: TopicRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "topic", categoryLabel: topic.label }) });
    const body = await r.json();
    if (!r.ok) {
      setBusy(false);
      return setError(body.error ?? "Не вдалося почати");
    }
    router.push(`/run/${body.runId}`);
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="group flex h-full flex-col justify-between gap-3 rounded-2xl bg-card p-4 text-left shadow-[0_0_0_1px_var(--grid)] transition-shadow hover:shadow-[0_0_0_2px_var(--ink)] disabled:opacity-60"
    >
      <span className="flex items-start gap-2">
        <span className="flex-1 text-[15px] font-semibold leading-snug">{shortName(topic.nameUa)}</span>
      </span>
      <span className="block">
        <span className="mb-1.5 flex items-baseline justify-between">
          <span className={`font-display text-lg font-bold tabular-nums ${topic.level ? LEVEL_TEXT[topic.level] : "text-ink-soft"}`}>{topic.score ?? "—"}</span>
          <span className="text-xs text-ink-soft group-hover:text-ink">{busy ? "Готую…" : "Тест"}</span>
        </span>
        <ScoreGauge score={topic.score} size="sm" />
      </span>
      {error && <span className="text-xs text-bad">{error}</span>}
    </button>
  );
}
