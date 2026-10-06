import type { StreakInfo } from "@/lib/dashboard";
import { Icon } from "./Icon";

const WEEKDAY = new Intl.DateTimeFormat("uk-UA", { weekday: "short", timeZone: "UTC" });

/** Ring showing today's progress towards the daily goal. */
export function GoalRing({ count, goal, size = 44 }: { count: number; goal: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const done = Math.min(1, count / goal);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={done >= 1 ? "var(--flame)" : "var(--ink)"}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - done)}
        style={{ transition: "stroke-dashoffset 600ms ease-out" }}
      />
    </svg>
  );
}

export function StreakCard({ streak }: { streak: StreakInfo }) {
  const left = Math.max(0, streak.dailyGoal - streak.todayCount);
  const alive = streak.current > 0;
  const message =
    left === 0
      ? "Ціль на сьогодні виконано. Серія в безпеці!"
      : alive
        ? `Ще ${left} ${plural(left)} сьогодні — і серія продовжиться.`
        : `Розв'яжи ${streak.dailyGoal} завдань сьогодні, щоб почати серію.`;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-[0_1px_0_var(--grid),0_0_0_1px_var(--grid)]">
      <div className="flex items-center gap-4">
        <span className={`grid size-14 place-items-center rounded-2xl ${alive ? "bg-flame/15 text-flame" : "bg-paper-2 text-ink-soft"}`}>
          <Icon name="flame" className={`size-8 ${alive ? "flicker" : ""}`} filled={alive} />
        </span>
        <div className="flex-1">
          <p className="font-display text-3xl font-bold tabular-nums leading-none">
            {streak.current} <span className="text-base font-semibold">{dayWord(streak.current)}</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">Рекорд: {streak.best}</p>
        </div>
        <div className="relative grid place-items-center">
          <GoalRing count={streak.todayCount} goal={streak.dailyGoal} size={52} />
          <span className="absolute font-display text-xs font-bold tabular-nums">
            {Math.min(streak.todayCount, streak.dailyGoal)}/{streak.dailyGoal}
          </span>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Останні 7 днів">
        {streak.week.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-1">
            <span
              className={`grid size-9 place-items-center rounded-xl ${
                d.goalMet ? "bg-flame text-white" : d.count > 0 ? "bg-flame/15 text-flame" : "bg-paper-2 text-ink-soft"
              } ${d.isToday ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""}`}
              title={`${d.count} завдань`}
            >
              {d.goalMet ? <Icon name="flame" className="size-5" filled /> : <span className="text-xs tabular-nums">{d.count || ""}</span>}
            </span>
            <span className={`text-[11px] ${d.isToday ? "font-bold" : "text-ink-soft"}`}>{WEEKDAY.format(new Date(`${d.date}T12:00:00Z`))}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm">{message}</p>
    </section>
  );
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "завдання";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "завдання";
  return "завдань";
}

export function dayWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день поспіль";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дні поспіль";
  return "днів поспіль";
}
