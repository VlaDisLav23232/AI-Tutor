"use client";

import { useState } from "react";
import type { SavedKind } from "@/lib/types";
import { Icon } from "@/components/Icon";

/** ★ save to favourites, ! "give me this exact task again" (served in practice with priority). */
export function SaveButtons({ taskId, initial = [] }: { taskId: string; initial?: SavedKind[] }) {
  const [marks, setMarks] = useState<SavedKind[]>(initial);

  async function toggle(kind: SavedKind) {
    const on = !marks.includes(kind);
    setMarks((m) => (on ? [...m, kind] : m.filter((k) => k !== kind)));
    const r = await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, kind, on }) });
    if (!r.ok) setMarks((m) => (on ? m.filter((k) => k !== kind) : [...m, kind]));
  }

  const fav = marks.includes("favorite");
  const rep = marks.includes("repeat");
  return (
    <span className="flex gap-1.5">
      <button
        type="button"
        onClick={() => toggle("favorite")}
        aria-pressed={fav}
        title={fav ? "Прибрати з обраних" : "Додати в обрані"}
        className={`grid size-9 place-items-center rounded-xl transition-colors ${fav ? "bg-marker text-ink" : "bg-paper-2 text-ink-soft hover:text-ink"}`}
      >
        <Icon name="star" className={`size-5 ${fav ? "pop" : ""}`} filled={fav} />
        <span className="sr-only">Обране</span>
      </button>
      <button
        type="button"
        onClick={() => toggle("repeat")}
        aria-pressed={rep}
        title={rep ? "Не повторювати" : "Дати мені це завдання ще раз"}
        className={`grid size-9 place-items-center rounded-xl transition-colors ${rep ? "bg-flame text-white" : "bg-paper-2 text-ink-soft hover:text-ink"}`}
      >
        <Icon name="bang" className={`size-5 ${rep ? "pop" : ""}`} />
        <span className="sr-only">Повторити це завдання</span>
      </button>
    </span>
  );
}
