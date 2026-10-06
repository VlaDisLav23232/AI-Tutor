import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { prisma } from "@/lib/db";
import { getDashboard } from "@/lib/dashboard";
import { topicScoreBefore } from "@/lib/progress";
import { toDTO } from "@/lib/tasks";
import { EXAM_MAX_POINTS, mastery, MASTERY_WINDOW, toNmtScale, topicScore } from "@/lib/scoring";
import type { Answer } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { ScoreGauge } from "@/components/ScoreGauge";
import { TaskReview } from "@/components/TaskReview";
import { TopicTile } from "@/components/TopicTile";
import { shortName } from "@/lib/topicName";
import type { Response } from "@/components/task/TaskView";

export default async function RunResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const run = await prisma.testRun.findUnique({ where: { id }, include: { attempts: true } });
  if (!run || run.userId !== userId) notFound();
  if (!run.finishedAt) redirect(`/run/${id}`);

  const tasks = await prisma.task.findMany({ where: { id: { in: run.taskIds } }, include: { category: true } });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const attempts = new Map(run.attempts.map((a) => [a.taskId, a]));

  // How each topic in this run moved: score before the run → score right after it.
  const labels = [...new Set(run.attempts.map((a) => byId.get(a.taskId)?.categoryLabel).filter((l): l is string => !!l))];
  const after = new Date(run.finishedAt.getTime() + 1);
  const topicRows = await Promise.all(
    labels.map(async (label) => {
      const recent = await prisma.attempt.findMany({
        where: { userId, task: { categoryLabel: label }, createdAt: { lt: after } },
        orderBy: { createdAt: "desc" },
        take: MASTERY_WINDOW,
      });
      const name = tasks.find((t) => t.categoryLabel === label)!.category.nameUa;
      return { label, name, before: await topicScoreBefore(userId, label, run.startedAt), now: topicScore(mastery(recent.map((a) => a.points / a.maxPoints))) };
    }),
  );
  topicRows.sort((a, b) => b.now - (b.before ?? b.now) - (a.now - (a.before ?? a.now)));
  const gain = topicRows.reduce((s, r) => s + (r.before === null ? 0 : r.now - r.before), 0);

  const correct = run.attempts.filter((a) => a.correct).length;
  const isExam = run.mode === "exam";
  const scale = isExam && run.maxScore === EXAM_MAX_POINTS ? toNmtScale(run.score) : null;
  const dashboard = run.mode === "diagnostic" ? await getDashboard(userId) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-2xl bg-card p-6 shadow-[0_0_0_1px_var(--grid)]">
        <p className="text-sm font-semibold text-ink-soft">{run.mode === "diagnostic" ? "Діагностику завершено" : "Результат"}</p>
        {isExam ? (
          <>
            <p className="rise font-display text-5xl font-bold">{scale ?? "<100"}</p>
            <p className="mt-1 text-ink-soft">
              {scale ? "балів за шкалою 100–200" : "нижче порогу"} · {run.score} з {run.maxScore} тестових балів
            </p>
          </>
        ) : (
          <p className="rise font-display text-5xl font-bold">
            {correct}
            <span className="text-2xl text-ink-soft"> / {run.taskIds.length} правильно</span>
          </p>
        )}
        {gain > 0 && (
          <p className="float-up mt-3 flex items-center gap-2 font-display text-lg font-bold text-good">
            <Icon name="up" /> +{gain} балів у темах
          </p>
        )}
        {dashboard && (
          <div className="mt-5">
            <p className="text-sm font-semibold text-ink-soft">Твій рівень зараз</p>
            <div className="mt-2">
              <ScoreGauge score={dashboard.overall} size="lg" />
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/practice" className="rounded-xl bg-ink px-5 py-3 font-display text-sm font-bold text-on-ink">
            Практикуватися далі
          </Link>
          <Link href="/dashboard" className="rounded-xl border-2 border-ink px-5 py-3 font-display text-sm font-bold">
            На головну
          </Link>
        </div>
      </section>

      {dashboard && (
        <section>
          <h2 className="font-display text-lg font-bold">Почни з цих тем</h2>
          <p className="text-sm text-ink-soft">Вони зараз найслабші — тут найшвидше зростає бал.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {dashboard.weakest.map((t) => (
              <TopicTile key={t.label} topic={t} />
            ))}
          </div>
        </section>
      )}

      {topicRows.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold">Як змінилися теми</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {topicRows.map((r) => {
              const d = r.before === null ? null : r.now - r.before;
              return (
                <li key={r.label} className="rounded-2xl bg-card p-4 shadow-[0_0_0_1px_var(--grid)]">
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold">{shortName(r.name)}</span>
                    <span className="shrink-0 tabular-nums">
                      {d === null ? (
                        <span className="text-ink-soft">перший результат: {r.now}</span>
                      ) : (
                        <>
                          {r.before} → <strong>{r.now}</strong>{" "}
                          <span className={d > 0 ? "font-bold text-good" : d < 0 ? "font-bold text-bad" : "text-ink-soft"}>{d > 0 ? `+${d}` : d < 0 ? d : "±0"}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <ScoreGauge score={r.now} from={r.before ?? 100} size="sm" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-bold">Розбір завдань</h2>
        <div className="mt-3 space-y-2">
          {run.taskIds.map((tid, i) => {
            const t = byId.get(tid);
            if (!t) return null;
            const a = attempts.get(tid);
            return (
              <TaskReview
                key={tid}
                index={i + 1}
                task={toDTO(t)}
                categoryName={shortName(t.category.nameUa)}
                answer={t.answer as Answer}
                response={(a?.response as Response) ?? null}
                points={a?.points ?? 0}
                maxPoints={t.format === "matching" ? 4 : 1}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
