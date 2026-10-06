import { redirect } from "next/navigation";
import { auth, devLoginEnabled, signIn } from "@/auth";
import { Icon } from "@/components/Icon";
import { Marked } from "@/components/Marked";
import { ScoreGauge } from "@/components/ScoreGauge";

const DEMO_OPTIONS = [
  { l: "А", text: "з⟦а⟧стібка, черг⟦о⟧вий", state: "wrong" },
  { l: "Б", text: "кіл⟦о⟧метр, вір⟦ш⟧і", state: "none" },
  { l: "В", text: "черг⟦о⟧вий, ⟦а⟧лфавіт", state: "right" },
] as const;

const STEPS = [
  { title: "Діагностика за 15 хвилин", text: "16 завдань з найчастіших тем НМТ — і ти бачиш свій бал за кожною темою." },
  { title: "Практика, що знає твої слабкі місця", text: "Завдання підбираються самі: слабкі теми, повторення вчасно і твої помилки." },
  { title: "Розбір і зростання бала", text: "Після відповіді — чому правильно саме так, і як змінився твій бал з теми." },
];

const SAMPLE_TOPICS = [
  { name: "Наголос", score: 182 },
  { name: "Апостроф", score: 151 },
  { name: "Розділові знаки", score: 128 },
];

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function SignInButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button className="flex items-center gap-2 rounded-xl bg-ink px-6 py-3.5 font-display text-sm font-bold text-on-ink transition-transform hover:-translate-y-0.5">
          Увійти через Google
        </button>
      </form>
      {devLoginEnabled && (
        <form
          action={async () => {
            "use server";
            await signIn("demo", { redirectTo: "/dashboard" });
          }}
        >
          <button className="rounded-xl border-2 border-ink px-6 py-3.5 font-display text-sm font-bold">Демо-вхід (локально)</button>
        </form>
      )}
    </div>
  );
}

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="space-y-20 py-6 md:py-12">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-display text-xl font-bold tracking-tight">Бланк</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-5xl">Українська на НМТ без хаосу в підготовці</h1>
          <p className="mt-5 max-w-md text-lg leading-snug text-ink-soft">
            Справжні завдання НМТ 2026, розбір кожної помилки і практика, яка сама знаходить твої слабкі теми.
          </p>
          <div className="mt-8">
            <SignInButtons />
          </div>
          <p className="mt-4 text-sm text-ink-soft">Безкоштовно · 393 завдання · 37 тем</p>
        </div>

        {/* Live demo card */}
        <div className="relative" aria-hidden>
          <div className="grid-paper absolute -inset-3 -z-10 rotate-2 rounded-3xl opacity-60" />
          <div className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_var(--grid),0_20px_40px_-20px_rgba(27,42,107,0.35)]">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 font-semibold text-on-ink">
                <Icon name="target" className="size-3.5" /> Слабка тема
              </span>
              <span className="flex items-center gap-1 rounded-full bg-flame/15 px-2.5 py-0.5 font-bold text-flame">
                <Icon name="flame" className="flicker size-3.5" filled /> 5 днів поспіль
              </span>
            </div>
            <p className="mt-4 font-semibold leading-snug">Наголос правильно позначено в усіх словах рядка</p>
            <ul className="mt-3 space-y-2">
              {DEMO_OPTIONS.map((o) => (
                <li key={o.l} className="flex items-center gap-3">
                  <span
                    className={`relative grid size-10 shrink-0 place-items-center rounded-lg border-2 font-display text-sm ${
                      o.state === "right" ? "border-good bg-good text-white" : o.state === "wrong" ? "border-bad bg-bad/10 text-bad" : "border-ink-soft text-ink-soft"
                    }`}
                  >
                    {o.state === "right" ? (
                      <svg viewBox="0 0 24 24" className="draw-check size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : o.state === "wrong" ? (
                      <span className="text-2xl leading-none">✕</span>
                    ) : (
                      o.l
                    )}
                  </span>
                  <Marked text={o.text} className="text-[15px]" />
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-bad/10 p-3 text-sm">
              <strong>Чому не А:</strong> правильно — зАстібка, тож у рядку А помилка.
            </p>
            <div className="mt-4 rounded-2xl bg-paper-2 p-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold">Наголос</span>
                <span className="float-up flex items-center gap-0.5 font-display font-bold text-good">
                  <Icon name="up" className="size-4" />
                  +18
                </span>
              </div>
              <ScoreGauge score={146} from={128} />
            </div>
          </div>
        </div>
      </section>

      {/* How it works: a real sequence, so numbered */}
      <section>
        <h2 className="font-display text-2xl font-bold">Як це працює</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_var(--grid)]">
              <span className="grid size-9 place-items-center rounded-xl bg-ink font-display text-sm font-bold text-on-ink">{i + 1}</span>
              <h3 className="mt-4 font-display text-base font-bold">{s.title}</h3>
              <p className="mt-2 text-[15px] text-ink-soft">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Scores and streak */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-card p-6 shadow-[0_0_0_1px_var(--grid)]">
          <h2 className="font-display text-xl font-bold">Бал НМТ за кожною темою</h2>
          <p className="mt-1 text-[15px] text-ink-soft">Від 100 до 200 — одразу видно, що вже сильне, а що варто підтягнути.</p>
          <ul className="mt-5 space-y-4">
            {SAMPLE_TOPICS.map((t) => (
              <li key={t.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">{t.name}</span>
                  <span className="font-display font-bold tabular-nums">{t.score}</span>
                </div>
                <ScoreGauge score={t.score} size="sm" />
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-[0_0_0_1px_var(--grid)]">
          <h2 className="font-display text-xl font-bold">10 завдань на день — і серія горить</h2>
          <p className="mt-1 text-[15px] text-ink-soft">Кілька хвилин щодня працюють краще, ніж весь вечір перед іспитом.</p>
          <ol className="mt-6 grid grid-cols-7 gap-2">
            {WEEK.map((d, i) => (
              <li key={d} className="flex flex-col items-center gap-1.5">
                <span className={`grid size-10 place-items-center rounded-xl ${i < 5 ? "bg-flame text-white" : i === 5 ? "bg-flame/15 text-flame ring-2 ring-ink ring-offset-2 ring-offset-card" : "bg-paper-2"}`}>
                  {i < 5 ? <Icon name="flame" className="size-5" filled /> : i === 5 ? <span className="text-xs font-bold">6/10</span> : null}
                </span>
                <span className="text-xs text-ink-soft">{d}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex items-center gap-2 font-display text-lg font-bold text-flame">
            <Icon name="flame" className="flicker size-6" filled /> 5 днів поспіль
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="rounded-3xl bg-ink p-8 text-on-ink md:p-12">
        <h2 className="font-display text-2xl font-bold md:text-3xl">Почни з діагностики — 15 хвилин</h2>
        <p className="mt-2 max-w-lg opacity-80">Дізнаєшся свій бал за кожною темою і з чого почати.</p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button className="rounded-xl bg-on-ink px-6 py-3.5 font-display text-sm font-bold text-ink">Увійти через Google</button>
        </form>
      </section>
    </div>
  );
}
