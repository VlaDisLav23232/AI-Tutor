import { requireUserId } from "@/auth";
import { EXAM_MINUTES } from "@/lib/config";
import { StartRunButton } from "@/components/StartRunButton";

export default async function Exam() {
  await requireUserId();
  return (
    <div className="py-6">
      <h1 className="font-display text-3xl font-bold">Варіант НМТ</h1>
      <p className="mt-4 max-w-prose text-lg">
        30 завдань у тому ж порядку тем, що й на НМТ 2026: 25 з однією відповіддю і 5 на відповідність. Час — {EXAM_MINUTES} хвилин.
      </p>
      <p className="mt-3 max-w-prose text-ink-soft">Підказок і пояснень під час тесту немає. Після завершення побачиш бал за шкалою 100–200 і розбір кожного завдання.</p>
      <div className="mt-8">
        <StartRunButton mode="exam">Почати варіант</StartRunButton>
      </div>
    </div>
  );
}
