"use client";

import { useMemo, useState } from "react";
import type { TopicRow } from "@/lib/dashboard";
import { TopicTile } from "./TopicTile";

type Sort = "weak" | "name";

/** Compact topic grid with filter chips by area, so nothing needs long scrolling. */
export function TopicsBrowser({ topics }: { topics: TopicRow[] }) {
  const groups = useMemo(() => [...new Set(topics.map((t) => t.group))], [topics]);
  const [group, setGroup] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("weak");

  const shown = topics
    .filter((t) => !group || t.group === group)
    .sort((a, b) => (sort === "name" ? a.nameUa.localeCompare(b.nameUa, "uk") : (a.score ?? 999) - (b.score ?? 999)));
  const due = topics.filter((t) => t.dueForReview).length;

  const counts = useMemo(() => Object.fromEntries(groups.map((g) => [g, topics.filter((t) => t.group === g).length])), [groups, topics]);

  // Phones: a horizontal chip row. Desktop: a vertical section list beside the grid.
  const chip = (active: boolean) =>
    `flex shrink-0 items-center justify-between gap-3 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap md:rounded-xl md:py-2 md:text-left md:whitespace-normal ${
      active
        ? "bg-ink text-on-ink font-semibold"
        : "bg-card shadow-[0_0_0_1px_var(--grid)] hover:shadow-[0_0_0_1px_var(--ink)] md:bg-transparent md:shadow-none md:hover:bg-paper-2 md:hover:shadow-none"
    }`;
  const count = (n: number, active: boolean) => (
    <span className={`hidden tabular-nums md:inline ${active ? "" : "text-ink-soft"}`}>{n}</span>
  );

  return (
    <div className="mt-4 md:grid md:grid-cols-[14rem_1fr] md:items-start md:gap-6">
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:sticky md:top-4 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:border-r md:border-grid md:px-0 md:pr-3"
        role="tablist"
        aria-label="Розділи"
      >
        <button type="button" role="tab" aria-selected={!group} className={chip(!group)} onClick={() => setGroup(null)}>
          <span>
            Усі<span className="md:hidden"> · {topics.length}</span>
          </span>
          {count(topics.length, !group)}
        </button>
        {groups.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={group === g} className={chip(group === g)} onClick={() => setGroup(g)}>
            <span>{g}</span>
            {count(counts[g], group === g)}
          </button>
        ))}
      </div>

      <div>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm md:mt-0">
        <span className="text-ink-soft">{due > 0 ? `${due} тем чекають на повторення` : `${shown.length} тем`}</span>
        <label className="flex items-center gap-2">
          <span className="text-ink-soft">Сортувати:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-grid bg-card px-2 py-1">
            <option value="weak">спершу слабкі</option>
            <option value="name">за назвою</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {shown.map((t) => (
          <TopicTile key={t.label} topic={t} />
        ))}
      </div>
      </div>
    </div>
  );
}
