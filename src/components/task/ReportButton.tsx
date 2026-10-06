"use client";

import { useState } from "react";

export function ReportButton({ taskId, kind }: { taskId: string; kind: "task" | "explanation" | "ai_reply" }) {
  const [sent, setSent] = useState(false);
  if (sent) return <span className="text-sm text-ink-soft">Дякуємо, перевіримо.</span>;
  return (
    <button
      type="button"
      className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
      onClick={async () => {
        const comment = window.prompt("Що не так? (необов'язково)") ?? undefined;
        await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, kind, comment: comment || undefined }),
        });
        setSent(true);
      }}
    >
      Повідомити про помилку
    </button>
  );
}
