import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserId, signOut } from "@/auth";
import { getDashboard } from "@/lib/dashboard";
import { Icon } from "@/components/Icon";
import { ScoreGauge } from "@/components/ScoreGauge";
import { StreakCard } from "@/components/StreakCard";
import { TopicTile } from "@/components/TopicTile";

const card = "rounded-2xl bg-card p-5 shadow-[0_0_0_1px_var(--grid)]";

export default async function Dashboard() {
  const userId = await requireUserId();
  const d = await getDashboard(userId);
  if (!d.hasDiagnostic) redirect("/diagnostic");
  const firstName = d.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold md:text-3xl">{firstName ? `Привіт, ${firstName}!` : "Привіт!"}</h1>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <section className={card}>
          <p className="text-sm font-semibold text-ink-soft">Твій рівень зараз</p>
          <div className="mt-3">
            <ScoreGauge score={d.overall} size="lg" />
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Середній бал за {d.triedCount} з {d.topicCount} тем, які ти вже пробував. Кожна тема — від 100 до 200.
          </p>
        </section>
        <StreakCard streak={d.streak} />
      </div>

      <Link
        href="/practice"
        className="group flex items-center gap-4 rounded-2xl bg-ink p-5 text-on-ink transition-transform hover:-translate-y-0.5"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-on-ink/15">
          <Icon name="play" className="size-6" filled />
        </span>
        <span className="flex-1">
          <span className="block font-display text-lg font-bold">Почати практику</span>
          <span className="block text-sm opacity-80">Безкінечні завдання під тебе: слабкі теми, повторення і твої помилки</span>
        </span>
        {d.dueCount > 0 && (
          <span className="hidden shrink-0 rounded-full bg-marker px-3 py-1 text-sm font-semibold text-ink sm:block">{d.dueCount} на повторення</span>
        )}
      </Link>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Твої 5 найслабших тем</h2>
          <Link href="/practice?focus=weakest" className="flex items-center gap-2 rounded-xl border-2 border-ink px-4 py-2 font-display text-sm font-bold hover:bg-paper-2">
            <Icon name="target" className="size-4" /> Тренувати найслабші теми
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {d.weakest.map((t) => (
            <TopicTile key={t.label} topic={t} />
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/topics" className={`${card} flex items-center gap-3 hover:shadow-[0_0_0_2px_var(--ink)]`}>
          <Icon name="grid" className="size-6" />
          <span>
            <span className="block font-semibold">Усі теми</span>
            <span className="text-sm text-ink-soft">Тест з 10 завдань на вибір</span>
          </span>
        </Link>
        <Link href="/saved" className={`${card} flex items-center gap-3 hover:shadow-[0_0_0_2px_var(--ink)]`}>
          <Icon name="star" className="size-6" />
          <span>
            <span className="block font-semibold">Збережені</span>
            <span className="text-sm text-ink-soft">
              ★ {d.saved.favorite ?? 0} обраних · ! {d.saved.repeat ?? 0} на повтор
            </span>
          </span>
        </Link>
        <Link href="/exam" className={`${card} flex items-center gap-3 hover:shadow-[0_0_0_2px_var(--ink)]`}>
          <Icon name="sheet" className="size-6" />
          <span>
            <span className="block font-semibold">Варіант НМТ</span>
            <span className="text-sm text-ink-soft">30 завдань з таймером</span>
          </span>
        </Link>
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="text-sm text-ink-soft underline underline-offset-2">Вийти з акаунта</button>
      </form>
    </div>
  );
}
