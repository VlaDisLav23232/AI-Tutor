import { requireUserId } from "@/auth";
import { DIAGNOSTIC_MINUTES } from "@/lib/config";
import { StartRunButton } from "@/components/StartRunButton";

export default async function Diagnostic() {
  await requireUserId();
  return (
    <div className="py-6">
      <h1 className="font-display text-3xl font-bold">Діагностика</h1>
      <p className="mt-4 max-w-prose text-lg">
        16 завдань з тем, що найчастіше трапляються на НМТ, і {DIAGNOSTIC_MINUTES} хвилин на них. Відповіді й пояснення побачиш у кінці, як на справжньому
        тесті.
      </p>
      <p className="mt-3 max-w-prose text-ink-soft">Після цього отримаєш орієнтовний бал і список тем, де втрачаєш найбільше.</p>
      <div className="mt-8">
        <StartRunButton mode="diagnostic">Почати діагностику</StartRunButton>
      </div>
    </div>
  );
}
