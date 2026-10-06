"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { Marked } from "./Marked";
import { StartRunButton } from "./StartRunButton";
import { shortName } from "@/lib/topicName";

export interface SavedItem {
  taskId: string;
  kind: "favorite" | "repeat";
  topic: string;
  question: string;
  firstOption: string;
}

const TABS = [
  { kind: "favorite", label: "Обрані", icon: "star" },
  { kind: "repeat", label: "Повторити", icon: "bang" },
] as const;

export function SavedList({ items: initial, initialTab }: { items: SavedItem[]; initialTab: SavedItem["kind"] }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState(initialTab);
  const shown = items.filter((i) => i.kind === tab);

  async function remove(item: SavedItem) {
    setItems((all) => all.filter((i) => !(i.taskId === item.taskId && i.kind === item.kind)));
    await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: item.taskId, kind: item.kind, on: false }) });
  }

  return (
    <div className="mt-5">
      <div className="flex rounded-xl bg-paper-2 p-1" role="tablist">
        {TABS.map((t) => {
          const count = items.filter((i) => i.kind === t.kind).length;
          return (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={tab === t.kind}
              onClick={() => setTab(t.kind)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm ${tab === t.kind ? "bg-card font-semibold shadow-[0_0_0_1px_var(--grid)]" : "text-ink-soft"}`}
            >
              <Icon name={t.icon} className="size-4" filled={t.kind === "favorite" && tab === t.kind} />
              {t.label} · {count}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-grid p-8 text-center">
          <p className="font-semibold">Тут поки порожньо</p>
          <p className="mt-1 text-sm text-ink-soft">
            Під час розв&apos;язування натисни {tab === "favorite" ? "★" : "!"} у правому верхньому куті завдання.
          </p>
          <Link href="/practice" className="mt-4 inline-block rounded-xl bg-ink px-5 py-2.5 font-display text-sm font-bold text-on-ink">
            До практики
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <StartRunButton key={tab} mode="saved" savedKind={tab}>
              Розв&apos;язати всі ({shown.length})
            </StartRunButton>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {shown.map((i) => (
              <li key={i.taskId + i.kind} className="flex gap-3 rounded-2xl bg-card p-4 shadow-[0_0_0_1px_var(--grid)]">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink-soft">{shortName(i.topic)}</p>
                  <p className="mt-1 line-clamp-2 text-[15px]">
                    <Marked text={i.question || i.firstOption} />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-paper-2 hover:text-ink"
                  aria-label="Прибрати"
                  title="Прибрати"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
