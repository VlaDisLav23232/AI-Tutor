import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { reasonLabel, REPORT_KIND_LABEL, type ReportStatus } from "@/lib/reports";
import { isCurrentExplanation, type ExplanationContent } from "@/lib/types";
import { Marked, Shape } from "@/components/Marked";
import { ActionButton } from "./ActionButton";
import { deleteExplanation, hideGeneratedTask, setGroupStatus } from "./actions";

export const metadata: Metadata = { title: "Скарги — адмін-панель", robots: { index: false } };

const STATUS_TABS: { value: ReportStatus | "all"; label: string }[] = [
  { value: "open", label: "Відкриті" },
  { value: "resolved", label: "Виправлені" },
  { value: "rejected", label: "Відхилені" },
  { value: "all", label: "Усі" },
];
const KIND_TABS = [
  { value: "all", label: "Усе" },
  { value: "explanation", label: "Пояснення" },
  { value: "task", label: "AI-завдання" },
];
const STATUS_LABEL: Record<string, string> = { open: "Відкрита", resolved: "Виправлено", rejected: "Відхилено" };

interface TaskSnapshot {
  question: string;
  passage: { shape: string; text: string }[] | null;
  items: Record<string, string> | null;
  options: Record<string, string>;
  answer: string | Record<string, string>;
  source: string;
}
interface Snapshot {
  task: TaskSnapshot;
  explanation: { content: ExplanationContent | LegacyExplanation; status: string; model: string } | null;
}

const dateFmt = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function complaints(n: number) {
  const plural = new Intl.PluralRules("uk").select(n);
  return plural === "one" ? "скарга" : plural === "few" ? "скарги" : "скарг";
}

function href(status: string, kind: string) {
  const p = new URLSearchParams();
  if (status !== "open") p.set("status", status);
  if (kind !== "all") p.set("kind", kind);
  const q = p.toString();
  return q ? `/admin/reports?${q}` : "/admin/reports";
}

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUS_TABS.some((t) => t.value === sp.status) ? sp.status! : "open";
  const kind = KIND_TABS.some((t) => t.value === sp.kind) ? sp.kind! : "all";

  const kindWhere = kind === "all" ? {} : { kind };
  const [reports, counts] = await Promise.all([
    prisma.report.findMany({
      where: { ...kindWhere, ...(status === "all" ? {} : { status }) },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.report.groupBy({ by: ["status"], where: kindWhere, _count: true }),
  ]);
  const countOf = (s: string) => (s === "all" ? counts.reduce((n, c) => n + c._count, 0) : (counts.find((c) => c.status === s)?._count ?? 0));

  // One card per task + kind + status: several students flagging the same thing read as one problem.
  const groups = new Map<string, typeof reports>();
  for (const r of reports) {
    const key = `${r.taskId}|${r.kind}|${r.status}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const tasks = await prisma.task.findMany({
    where: { id: { in: [...new Set(reports.map((r) => r.taskId))] } },
    include: { category: { select: { nameUa: true } }, explanation: { select: { createdAt: true } } },
  });
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Скарги</h1>
        <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Адмін-панель</span>
      </div>
      <p className="mt-1 text-ink-soft">Повідомлення учнів про помилки в поясненнях і AI-завданнях. Скарги на одне й те саме зібрано в одну картку.</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <nav className="flex rounded-xl bg-paper-2 p-1" aria-label="Статус">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.value}
              href={href(t.value, kind)}
              aria-current={status === t.value ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${status === t.value ? "bg-card font-semibold shadow-[0_0_0_1px_var(--grid)]" : "text-ink-soft hover:text-ink"}`}
            >
              {t.label} · {countOf(t.value)}
            </Link>
          ))}
        </nav>
        <nav className="flex gap-1" aria-label="Тип">
          {KIND_TABS.map((t) => (
            <Link
              key={t.value}
              href={href(status, t.value)}
              aria-current={kind === t.value ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${kind === t.value ? "border-ink bg-ink text-on-ink" : "border-grid text-ink-soft hover:text-ink"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {groups.size === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-grid p-8 text-center">
          <p className="font-semibold">{status === "open" ? "Відкритих скарг немає" : "Тут порожньо"}</p>
          <p className="mt-1 text-sm text-ink-soft">Нові скарги з’являтимуться тут, щойно учні натиснуть «Повідомити про помилку».</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {[...groups.values()].map((group) => {
            const latest = group[0];
            const task = taskById.get(latest.taskId);
            const snap = latest.snapshot as Snapshot | null;
            const shownTask = snap?.task ?? (task as unknown as TaskSnapshot | undefined);
            const fields = { taskId: latest.taskId, kind: latest.kind, from: latest.status };
            const isExplanation = latest.kind === "explanation";
            // Regenerated after the latest report, or deleted: the snapshot is no longer what students see.
            const explanationChanged = isExplanation && (!task?.explanation || task.explanation.createdAt > latest.createdAt);

            const reasonCounts = new Map<string, number>();
            for (const r of group) {
              const l = reasonLabel(r.kind, r.reason) ?? "Без причини";
              reasonCounts.set(l, (reasonCounts.get(l) ?? 0) + 1);
            }

            return (
              <li key={`${latest.taskId}|${latest.kind}|${latest.status}`} className="rounded-2xl bg-card p-4 shadow-[0_0_0_1px_var(--grid)] md:p-5">
                <header className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isExplanation ? "bg-marker/30" : "bg-flame/15 text-flame"}`}>
                    {REPORT_KIND_LABEL[latest.kind] ?? latest.kind}
                  </span>
                  {task && <span className="font-semibold">{task.category.nameUa}</span>}
                  <span className="font-mono text-xs text-ink-soft">{latest.taskId}</span>
                  {latest.status !== "open" && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs">{STATUS_LABEL[latest.status]}</span>}
                  {task && !task.verified && <span className="rounded-full bg-bad/10 px-2 py-0.5 text-xs text-bad">Приховане</span>}
                  <span className="ml-auto text-ink-soft">
                    {group.length > 1 ? `${group.length} ${complaints(group.length)} · ` : ""}
                    {dateFmt.format(latest.createdAt)}
                  </span>
                </header>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[...reasonCounts].map(([label, n]) => (
                    <span key={label} className="rounded-lg bg-bad/10 px-2 py-1 text-sm font-semibold text-bad">
                      {label}
                      {n > 1 && ` ×${n}`}
                    </span>
                  ))}
                </div>

                <div className={`mt-4 grid gap-4 ${isExplanation && snap?.explanation ? "md:grid-cols-2" : ""}`}>
                  {shownTask ? <TaskBlock task={shownTask} /> : <p className="text-ink-soft">Завдання видалено з бази.</p>}
                  {isExplanation && snap?.explanation && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        Пояснення, яке бачив учень · {snap.explanation.model}
                        {explanationChanged && <span className="ml-1 normal-case tracking-normal text-good">(вже оновлене)</span>}
                      </p>
                      <ExplanationBlock content={snap.explanation.content} />
                    </div>
                  )}
                </div>

                <ul className="mt-4 divide-y divide-grid border-t border-grid">
                  {group.map((r) => (
                    <li key={r.id} className="py-2.5 text-[15px]">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
                        <span className="font-semibold text-ink">{reasonLabel(r.kind, r.reason) ?? "Без причини"}</span>
                        <span>· {r.user.email ?? r.user.name ?? "учень"}</span>
                        <span>· {dateFmt.format(r.createdAt)}</span>
                      </div>
                      {r.comment && <p className="mt-1 whitespace-pre-wrap">«{r.comment}»</p>}
                    </li>
                  ))}
                </ul>

                <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-grid pt-3">
                  {latest.status === "open" ? (
                    <>
                      <ActionButton action={setGroupStatus} fields={{ ...fields, to: "resolved" }} label="Виправлено" tone="primary" />
                      <ActionButton action={setGroupStatus} fields={{ ...fields, to: "rejected" }} label="Відхилити" />
                      {isExplanation && task?.explanation && (
                        <ActionButton
                          action={deleteExplanation}
                          fields={{ taskId: latest.taskId }}
                          label="Видалити пояснення"
                          tone="danger"
                          confirm="Наступний учень отримає нове пояснення від AI. Видалити?"
                        />
                      )}
                      {!isExplanation && task?.source === "generated" && task.verified && (
                        <ActionButton
                          action={hideGeneratedTask}
                          fields={{ taskId: latest.taskId }}
                          label="Сховати завдання"
                          tone="danger"
                          confirm="Завдання більше не трапиться учням. Сховати?"
                        />
                      )}
                    </>
                  ) : (
                    <ActionButton action={setGroupStatus} fields={{ ...fields, to: "open" }} label="Повернути у відкриті" />
                  )}
                </footer>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TaskBlock({ task }: { task: TaskSnapshot }) {
  const single = typeof task.answer === "string" ? task.answer : null;
  const key = typeof task.answer === "object" ? task.answer : null;
  return (
    <div className="rounded-xl bg-paper-2 p-3 text-[15px]">
      {task.passage && (
        <div className="mb-2 space-y-1">
          {task.passage.map((s, i) => (
            <p key={i}>
              <span className="mr-1.5">
                <Shape char={s.shape} />
              </span>
              <Marked text={s.text} />
            </p>
          ))}
        </div>
      )}
      <p className="font-semibold">
        <Marked text={task.question} />
      </p>
      {task.items && (
        <ol className="mt-2 space-y-0.5">
          {Object.entries(task.items).map(([n, text]) => (
            <li key={n}>
              <strong>{n}</strong> <Marked text={text} /> {key?.[n] && <span className="font-semibold text-good">→ {key[n]}</span>}
            </li>
          ))}
        </ol>
      )}
      <ul className="mt-2 space-y-0.5">
        {Object.entries(task.options).map(([l, text]) => (
          <li key={l} className={single === l ? "rounded bg-good/15 px-1.5 font-semibold text-good" : "px-1.5"}>
            <strong>{l}</strong> <Marked text={text} />
            {single === l && " ✓"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Explanations written before the v2 format; reports may still point at them. */
interface LegacyExplanation {
  rule: string;
  whyCorrect: string;
  whyWrong?: Record<string, string>;
  perItem?: Record<string, string>;
  tip?: string;
}

function ExplanationBlock({ content }: { content: ExplanationContent | LegacyExplanation }) {
  if (!isCurrentExplanation(content)) return <LegacyExplanationBlock content={content} />;
  return (
    <div className="space-y-2 rounded-xl bg-paper-2 p-3 text-[15px]">
      <ul className="space-y-0.5">
        {content.options.map((o) => (
          <li key={o.letter} className={o.correct ? "font-semibold text-good" : ""}>
            <strong>
              {o.letter}
              {o.correct && " ✓"}:
            </strong>{" "}
            <Marked text={o.why} rich />
          </li>
        ))}
        {content.items.map((p) => (
          <li key={p.item}>
            <strong>
              {p.item} — {p.letter}
            </strong>
            , бо <Marked text={p.why} rich />
          </li>
        ))}
      </ul>
      {content.takeaway && (
        <p>
          <strong>Як запам&apos;ятати: </strong>
          <Marked text={content.takeaway} rich />
        </p>
      )}
    </div>
  );
}

function LegacyExplanationBlock({ content }: { content: LegacyExplanation }) {
  return (
    <div className="space-y-2 rounded-xl bg-paper-2 p-3 text-[15px]">
      <p className="text-xs text-ink-soft">Старий формат: замінюється новим, коли учень наступного разу попросить пояснення.</p>
      <p>
        <strong>Правило: </strong>
        <Marked text={content.rule} />
      </p>
      <p>
        <strong>Чому так: </strong>
        <Marked text={content.whyCorrect} />
      </p>
      {content.perItem && (
        <ul className="space-y-0.5">
          {Object.entries(content.perItem).map(([n, why]) => (
            <li key={n}>
              <strong>{n}:</strong> <Marked text={why} />
            </li>
          ))}
        </ul>
      )}
      {Object.keys(content.whyWrong ?? {}).length > 0 && (
        <details>
          <summary className="cursor-pointer text-ink-soft">Чому не інші варіанти</summary>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(content.whyWrong ?? {}).map(([l, why]) => (
              <li key={l}>
                <strong>{l}:</strong> <Marked text={why} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {content.tip && (
        <p>
          <strong>Порада: </strong>
          <Marked text={content.tip} />
        </p>
      )}
    </div>
  );
}
