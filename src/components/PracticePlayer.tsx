"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskDTO } from "@/lib/types";
import { Icon, type IconName } from "./Icon";
import { GoalRing } from "./StreakCard";
import { ScoreGauge } from "./ScoreGauge";
import { shortName } from "@/lib/topicName";
import { TaskCard, type CheckResult } from "./task/TaskCard";

/** null = an ordinary task: shown without a label. */
type Reason = "repeat" | "mistake" | "review" | "weak" | null;
const REASONS: Record<Exclude<Reason, null>, { label: string; icon: IconName }> = {
  weak: { label: "Слабка тема", icon: "target" },
  review: { label: "Час повторити", icon: "repeat" },
  mistake: { label: "Твоя помилка", icon: "x" },
  repeat: { label: "Ти позначив «!»", icon: "bang" },
};

interface TopicSession {
  name: string;
  start: number; // score before the first answer this session
  now: number;
  firstTime: boolean;
}

interface Props {
  runId: string;
  focus: "all" | "weakest";
  categoryNames: Record<string, string>;
  todayCount: number;
  dailyGoal: number;
}

export function PracticePlayer({ runId: initialRunId, focus, categoryNames, todayCount: initialToday, dailyGoal }: Props) {
  const router = useRouter();
  const [runId, setRunId] = useState(initialRunId);
  const [task, setTask] = useState<TaskDTO | null>(null);
  const [reason, setReason] = useState<Reason>(null);
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(initialToday);
  const [stats, setStats] = useState({ done: 0, correct: 0, combo: 0, bestCombo: 0 });
  const [topics, setTopics] = useState<Record<string, TopicSession>>({});
  const [showSummary, setShowSummary] = useState(false);

  const requestNext = useCallback(
    (forRun: string) =>
      fetch("/api/practice/next", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: forRun, focus }) }).then(
        async (r) => ({ ok: r.ok, body: await r.json() }),
      ),
    [focus],
  );

  function show({ ok, body }: { ok: boolean; body: { task?: TaskDTO; reason?: Reason; runId?: string; error?: string } }) {
    setLoading(false);
    if (!ok || !body.task) return setError(body.error ?? "Не вдалося завантажити завдання");
    setTask(body.task);
    setReason(body.reason ?? null);
    if (body.runId) setRunId(body.runId);
    setAnswered(false);
    window.scrollTo({ top: 0 });
  }

  function loadNext() {
    setLoading(true);
    setError(null);
    requestNext(runId).then(show);
  }

  useEffect(() => {
    let current = true;
    requestNext(initialRunId).then((res) => current && show(res));
    return () => {
      current = false;
    };
  }, [requestNext, initialRunId]);

  function onAnswered(result: CheckResult | null) {
    setAnswered(true);
    if (!result) return;
    setStats((s) => {
      const combo = result.correct ? s.combo + 1 : 0;
      return { done: s.done + 1, correct: s.correct + (result.correct ? 1 : 0), combo, bestCombo: Math.max(s.bestCombo, combo) };
    });
    if (result.goal) setToday(result.goal.todayCount);
    const t = result.topic;
    if (t) {
      setTopics((all) => ({
        ...all,
        [t.label]: all[t.label]
          ? { ...all[t.label], now: t.after }
          : { name: t.name, start: t.firstTime ? t.after : t.before, now: t.after, firstTime: t.firstTime },
      }));
    }
  }

  const sessionGain = Object.values(topics).reduce((s, t) => s + (t.firstTime ? 0 : t.now - t.start), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="sticky top-0 z-10 -mx-4 mb-5 border-b border-grid bg-paper/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (stats.done ? setShowSummary(true) : router.push("/dashboard"))}
            className="grid size-9 place-items-center rounded-xl hover:bg-paper-2"
            aria-label="Завершити практику"
          >
            <Icon name="x" />
          </button>
          <div className="flex rounded-xl bg-paper-2 p-1 text-sm" role="tablist" aria-label="Які теми">
            {(["all", "weakest"] as const).map((f) => (
              <Link
                key={f}
                href={f === "all" ? "/practice" : "/practice?focus=weakest"}
                replace
                role="tab"
                aria-selected={focus === f}
                className={`rounded-lg px-3 py-1 ${focus === f ? "bg-card font-semibold shadow-[0_0_0_1px_var(--grid)]" : "text-ink-soft"}`}
              >
                {f === "all" ? "Усі теми" : "Найслабші теми"}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {stats.combo >= 2 && (
              <span key={stats.combo} className="pop flex items-center gap-1 rounded-full bg-flame/15 px-2.5 py-1 font-display text-sm font-bold text-flame" title="Правильних підряд">
                <Icon name="bolt" className="size-4" filled />×{stats.combo}
              </span>
            )}
            <span className="relative grid place-items-center" title={`Сьогодні ${today} з ${dailyGoal}`}>
              <GoalRing count={today} goal={dailyGoal} size={36} />
              <span className="absolute font-display text-[10px] font-bold tabular-nums">{Math.min(today, dailyGoal)}</span>
            </span>
          </div>
        </div>
      </header>

      {loading && !task && <p className="animate-pulse text-ink-soft">Підбираю завдання…</p>}
      {error && (
        <div className="rounded-2xl bg-bad/10 p-4">
          <p className="text-bad">{error}</p>
          <button type="button" onClick={loadNext} className="mt-3 rounded-xl border-2 border-ink px-4 py-2 font-display text-sm font-bold">
            Спробувати ще раз
          </button>
        </div>
      )}

      {task && (
        <TaskCard
          key={task.id + runId}
          task={task}
          runId={runId}
          instant
          tag={
            <>
              {reason && (
                <span className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-on-ink">
                  <Icon name={REASONS[reason].icon} className="size-3.5" />
                  {REASONS[reason].label}
                </span>
              )}
              <span>{shortName(categoryNames[task.categoryLabel] ?? task.categoryLabel)}</span>
            </>
          }
          onAnswered={(_, __, result) => onAnswered(result)}
          onSimilar={(t) => {
            setTask(t);
            setReason("mistake");
            setAnswered(false);
            window.scrollTo({ top: 0 });
          }}
          next={answered ? { label: loading ? "Підбираю…" : "Наступне завдання", onClick: loadNext, disabled: loading } : null}
        />
      )}

      {showSummary && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 md:items-center" role="dialog" aria-modal aria-label="Підсумок практики">
          <div className="rise max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-6 md:rounded-3xl">
            <h2 className="font-display text-2xl font-bold">Підсумок</h2>
            <p className="mt-1 text-ink-soft">
              {stats.done} завдань, {stats.correct} правильно
              {stats.bestCombo >= 2 && `, найдовша серія — ${stats.bestCombo}`}
            </p>
            {sessionGain > 0 && (
              <p className="float-up mt-4 flex items-center gap-2 font-display text-xl font-bold text-good">
                <Icon name="up" /> +{sessionGain} балів за сесію
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {Object.entries(topics)
                .sort((a, b) => b[1].now - b[1].start - (a[1].now - a[1].start))
                .map(([label, t]) => {
                  const d = t.now - t.start;
                  return (
                    <li key={label} className="rounded-2xl bg-card p-3 shadow-[0_0_0_1px_var(--grid)]">
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold">{shortName(t.name)}</span>
                        <span className="tabular-nums">
                          {t.firstTime ? (
                            <span className="text-ink-soft">новий: {t.now}</span>
                          ) : (
                            <>
                              {t.start} → <strong>{t.now}</strong>{" "}
                              <span className={d > 0 ? "font-bold text-good" : d < 0 ? "font-bold text-bad" : "text-ink-soft"}>
                                {d > 0 ? `+${d}` : d < 0 ? d : "±0"}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                      <ScoreGauge score={t.now} from={t.start} size="sm" />
                    </li>
                  );
                })}
            </ul>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowSummary(false)} className="flex-1 rounded-xl border-2 border-ink px-4 py-3 font-display text-sm font-bold">
                Продовжити
              </button>
              <Link href="/dashboard" className="flex-1 rounded-xl bg-ink px-4 py-3 text-center font-display text-sm font-bold text-on-ink">
                На головну
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
