import type { Answer, TaskDTO } from "@/lib/types";
import { anthropic } from "./providers/anthropic";
import { gemini } from "./providers/gemini";
import { groq } from "./providers/groq";
import type { JsonRequest, JsonResult, Provider, StreamRequest } from "./providers/types";
import { AiUnavailableError, assertBudget } from "./usage";

export { AI_BUDGET_USD, AiUnavailableError, aiSpentUsd } from "./usage";
export type { ChatTurn, Effort, Tier } from "./providers/types";

// Chosen with AI_PROVIDER in .env: anthropic (default), gemini or groq. Each provider has a "main" model for
// explanations, chat and generation and a "fast" one for blind verification of generated tasks.
// Only the chosen provider is ever called: if it fails, the request fails.
const PROVIDERS: Record<string, Provider> = { anthropic, gemini, groq };
const providerName = process.env.AI_PROVIDER?.trim().toLowerCase() || "anthropic";
const provider = PROVIDERS[providerName];
if (!provider) throw new Error(`Unknown AI_PROVIDER "${providerName}": use ${Object.keys(PROVIDERS).join(", ")}`);

export const AI_PROVIDER = provider.name;

export function aiEnabled(): boolean {
  return Boolean(process.env[provider.apiKeyEnv]);
}

/** Throws an AiUnavailableError when the key is missing or the spending cap is reached. */
async function ensureAvailable() {
  if (!aiEnabled()) throw new AiUnavailableError(`AI недоступний: не налаштовано ${provider.apiKeyEnv}`);
  await assertBudget();
}

/** Structured output with the shared tutor system prompt, plus the model that produced it. */
export async function generateJsonWithModel<T>(req: Omit<JsonRequest<T>, "system">): Promise<JsonResult<T>> {
  await ensureAvailable();
  return provider.generateJson({ ...req, system: SYSTEM_PROMPT });
}

/** Structured output; null when the model refused or the output was unusable. */
export async function generateJson<T>(req: Omit<JsonRequest<T>, "system">): Promise<T | null> {
  return (await generateJsonWithModel(req)).data;
}

/** Streamed plain-text reply with the shared tutor system prompt. */
export async function streamText(req: Omit<StreamRequest, "system">, signal: AbortSignal): Promise<AsyncIterable<string>> {
  await ensureAvailable();
  return provider.streamText({ ...req, system: SYSTEM_PROMPT }, signal);
}

/** Stable system prompt shared by all calls (cached where the provider supports it). */
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
