"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { REPORT_REASONS, type ReportKind } from "@/lib/reports";

const TITLES: Record<ReportKind, string> = {
  explanation: "Що не так із поясненням?",
  task: "Що не так із завданням?",
};

export function ReportButton({ taskId, kind, className = "" }: { taskId: string; kind: ReportKind; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reasons = Object.entries(REPORT_REASONS[kind]) as [string, string][];
  // "Інше" means nothing without a few words.
  const needsComment = reason === "other" && !comment.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || needsComment) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, kind, reason, comment: comment.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error);
      setSent(true);
      dialog.current?.close();
    } catch (err) {
      setError((err as Error).message || "Не вдалося надіслати. Спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <span className={`flex items-center gap-1 text-sm text-ink-soft ${className}`}>
        <Icon name="check" className="size-4 text-good" /> Дякуємо, перевіримо
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`flex items-center gap-1 text-sm text-ink-soft underline underline-offset-2 hover:text-ink ${className}`}
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="bang" className="size-3.5" />
        Повідомити про помилку
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`report-${kind}-${taskId}`}
        // Click on the backdrop closes it, like any modal.
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
      >
        <form onSubmit={submit} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={`report-${kind}-${taskId}`} className="font-display text-lg font-bold">
              {TITLES[kind]}
            </h2>
            <button type="button" aria-label="Закрити" onClick={() => dialog.current?.close()} className="-m-1 rounded-lg p-1 text-ink-soft hover:bg-paper-2">
              <Icon name="x" className="size-5" />
            </button>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Причина</legend>
            {reasons.map(([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-[15px] transition-colors ${
                  reason === value ? "border-ink bg-paper-2 font-semibold" : "border-grid hover:bg-paper-2"
                }`}
              >
                <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="size-4 accent-[var(--ink)]" />
                {label}
              </label>
            ))}
          </fieldset>

          <label className="mt-4 block text-sm font-semibold text-ink-soft">
            Деталі {reason === "other" ? "" : "(необов'язково)"}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Наприклад: правильна відповідь — В, бо…"
              className="mt-1 block w-full resize-y rounded-xl border-2 border-grid bg-paper p-3 text-[15px] font-normal text-ink placeholder:text-ink-soft/60 focus:border-ink focus:outline-none"
            />
          </label>

          {error && <p className="mt-3 text-sm text-bad">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-paper-2">
              Скасувати
            </button>
            <button
              type="submit"
              disabled={!reason || needsComment || busy}
              className="rounded-xl bg-ink px-5 py-2.5 font-display text-sm font-bold text-on-ink transition-opacity disabled:opacity-35"
            >
              {busy ? "Надсилаємо…" : "Надіслати"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
