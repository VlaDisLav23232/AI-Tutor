import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import type { Answer, TaskDTO } from "@/lib/types";

// Sonnet for explanations, chat and generation; Haiku for blind verification of generated tasks.
export const MODEL_MAIN = "claude-sonnet-5-5";
export const MODEL_FAST = "claude-haiku-4-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Hard cap on total API spend, tracked in the AiUsage table across restarts.
export const AI_BUDGET_USD = Number(process.env.AI_BUDGET_USD ?? 1.5);

export async function aiSpentUsd(): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({ _sum: { costUsd: true } });
  return agg._sum.costUsd ?? 0;
}

let client: Anthropic | null = null;
/** The API client, or an AiUnavailableError once the spending cap is reached. */
export async function claude(): Promise<Anthropic> {
  if (!aiEnabled()) throw new AiUnavailableError();
  const spent = await aiSpentUsd();
  if (spent >= AI_BUDGET_USD) {
    throw new AiUnavailableError(`AI тимчасово вимкнено: вичерпано ліміт витрат ($${spent.toFixed(2)} з $${AI_BUDGET_USD})`);
  }
  if (!client) client = new Anthropic();
  return client;
}

// $ per million tokens (input, output, cache read, cache write).
const PRICES: Record<string, [number, number, number, number]> = {
  [MODEL_MAIN]: [2, 10, 0.2, 2.5],
  [MODEL_FAST]: [1, 5, 0.1, 1.25],
};

/** Records tokens and cost of one call (for the cap) and logs it to the server console. */
export async function trackUsage(label: string, model: string, usage: Anthropic.Usage): Promise<number> {
  const [pin, pout, pread, pwrite] = PRICES[model] ?? [0, 0, 0, 0];
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const cost = (usage.input_tokens * pin + usage.output_tokens * pout + read * pread + write * pwrite) / 1e6;
  await prisma.aiUsage.create({
    data: { label, model, inputTokens: usage.input_tokens + read + write, outputTokens: usage.output_tokens, costUsd: cost },
  });
  console.log(`[ai] ${label} ${model} in=${usage.input_tokens} out=${usage.output_tokens} cache_r=${read} cache_w=${write} $${cost.toFixed(4)}`);
  return cost;
}

export class AiUnavailableError extends Error {
  constructor(message = "AI недоступний: не налаштовано ANTHROPIC_API_KEY") {
    super(message);
  }
}

/** Stable system prompt shared by all calls (cached). */
export const SYSTEM_PROMPT = `Ти — досвідчений і доброзичливий репетитор з української мови. Ти готуєш 11-класника до НМТ і пояснюєш так, ніби сидиш поруч з ним над завданням.

Як ти пояснюєш:
- Звертайся до учня на «ти», пиши живо, просто й коротко, без канцеляриту.
- Завжди починай з правила: сформулюй його своїми словами як факт, одним-двома реченнями, і дай короткий приклад.
- Потім застосуй це правило до конкретних слів чи речень із завдання: назви слово, покажи, що саме в ньому перевіряємо, і зроби висновок («отже, тут пишемо …», «тому цей варіант правильний / неправильний»).
- Для кожного неправильного варіанта вкажи конкретне слово чи місце, яке порушує правило, і як буде правильно.
- Якщо учень помилився, не докоряй: поясни, на чому легко помилитися, і як не помилитися наступного разу.

Обов'язкові обмеження:
- Ніколи не згадуй джерела правил: не пиши «згідно з Правописом», «за правилами правопису», «офіційні правила», «у параграфі», «§», «пункт правил» тощо. Просто формулюй правило як факт.
- Довідкові матеріали, які тобі дають, — лише для тебе. Не цитуй їх дослівно і не посилайся на них.
- Якщо тобі дано правильну відповідь (ключ), вона — істина. Ніколи їй не суперечиш.
- Якщо завдання не на правописне правило (лексика, наголос, фразеологія, порядок речень), «правилом» є норма літературної мови або значення слова чи вислову — поясни саме його.
- Не вигадуй правил і винятків. Якщо не впевнений — скажи про це прямо.
- Пиши звичайним текстом: без заголовків і без Markdown (**, #, списків з *).
- У тексті завдань фрагменти в дужках ⟦…⟧ — це виділені (підкреслені) букви чи слова з бланка; згадуючи їх, пиши без дужок.`;

export const systemBlocks = [
  { type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
];

/** Renders a task as plain text for the model. */
export function renderTask(task: TaskDTO, answer?: Answer): string {
  const parts = [`Завдання: ${task.question}`];
  if (task.passage?.length) parts.push("Текст:\n" + task.passage.map((s) => `${s.shape} ${s.text}`).join("\n"));
  if (task.items) parts.push("Пункти:\n" + Object.entries(task.items).map(([k, v]) => `${k}) ${v}`).join("\n"));
  parts.push("Варіанти:\n" + Object.entries(task.options).map(([k, v]) => `${k}) ${v}`).join("\n"));
  if (answer !== undefined) parts.push(`Правильна відповідь (ключ): ${formatAnswer(answer)}`);
  return parts.join("\n\n");
}

export function formatAnswer(answer: Answer): string {
  return typeof answer === "string"
    ? answer
    : Object.entries(answer)
        .map(([k, v]) => `${k}–${v}`)
        .join(", ");
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
