import { prisma } from "@/lib/db";

// Hard cap on total API spend (all providers), tracked in the AiUsage table across restarts.
export const AI_BUDGET_USD = Number(process.env.AI_BUDGET_USD ?? 1.5);

export class AiUnavailableError extends Error {
  constructor(message = "AI недоступний: не налаштовано ключ API") {
    super(message);
  }
}

export async function aiSpentUsd(): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({ _sum: { costUsd: true } });
  return agg._sum.costUsd ?? 0;
}

/** Throws an AiUnavailableError once the spending cap is reached. */
export async function assertBudget(): Promise<void> {
  const spent = await aiSpentUsd();
  if (spent >= AI_BUDGET_USD) {
    throw new AiUnavailableError(`AI тимчасово вимкнено: вичерпано ліміт витрат ($${spent.toFixed(2)} з $${AI_BUDGET_USD})`);
  }
}

/** Tokens of one call; `input` excludes cached tokens. */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** $ per million tokens: input, output, cache read, cache write. */
export type Prices = [number, number, number, number];

/** Records tokens and cost of one call (for the cap) and logs it to the server console. */
export async function recordUsage(label: string, model: string, u: Usage, prices: Prices | undefined): Promise<number> {
  const [pin, pout, pread, pwrite] = prices ?? [0, 0, 0, 0];
  const cost = (u.input * pin + u.output * pout + u.cacheRead * pread + u.cacheWrite * pwrite) / 1e6;
  await prisma.aiUsage.create({
    data: { label, model, inputTokens: u.input + u.cacheRead + u.cacheWrite, outputTokens: u.output, costUsd: cost },
  });
  console.log(`[ai] ${label} ${model} in=${u.input} out=${u.output} cache_r=${u.cacheRead} cache_w=${u.cacheWrite} $${cost.toFixed(4)}`);
  return cost;
}
