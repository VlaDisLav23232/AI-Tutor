import type { z } from "zod";

/** "main" for explanations, chat and generation; "fast" for blind verification of generated tasks. */
export type Tier = "main" | "fast";
export type Effort = "low" | "medium" | "high";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface BaseRequest {
  label: string;
  tier: Tier;
  system: string;
  maxTokens: number;
  /** How hard the model should think; omitted = provider default. */
  effort?: Effort;
}

export interface JsonRequest<T> extends BaseRequest {
  schema: z.ZodType<T>;
  prompt: string;
}

export interface StreamRequest extends BaseRequest {
  messages: ChatTurn[];
}

export interface Provider {
  name: string;
  apiKeyEnv: string;
  models: Record<Tier, string>;
  /** Structured output validated against `schema`; null when the model refused or returned nothing usable. */
  generateJson<T>(req: JsonRequest<T>): Promise<T | null>;
  /** Plain-text reply, chunk by chunk. */
  streamText(req: StreamRequest, signal: AbortSignal): AsyncIterable<string>;
}

export const REFUSAL_NOTE = "\n\n(AI не зміг відповісти на це питання.)";
