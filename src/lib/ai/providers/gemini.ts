import { FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { recordUsage, type Prices } from "../usage";
import { REFUSAL_NOTE, type Effort, type Provider, type Tier } from "./types";

const models: Record<Tier, string> = {
  main: process.env.GEMINI_MODEL_MAIN ?? "gemini-3.8-flash",
  fast: process.env.GEMINI_MODEL_FAST ?? "gemini-3.5-flash-lite",
};

// Paid-tier prices for prompts ≤200k tokens. Gemini has no cache-write charge for implicit caching.
// 3.8 Flash is on an introductory rate until 2026-12-31 (then $1.50 / $7.50 / $0.15).
const PRICES: Record<string, Prices> = {
  "gemini-3.8-flash": [0.75, 3.75, 0.075, 0],
  "gemini-3.6-flash": [0.75, 3.75, 0.075, 0],
  "gemini-3.5-flash-lite": [0.3, 2.5, 0.03, 0],
  "gemini-3.1-pro-preview": [2, 12, 0.2, 0],
  "gemini-2.5-pro": [1.25, 10, 0.125, 0],
  "gemini-2.5-flash": [0.3, 2.5, 0.03, 0],
};

const LEVELS: Record<Effort, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };

const BLOCKED = new Set<FinishReason | undefined>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

let client: GoogleGenAI | null = null;
function api(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function config(req: { system: string; maxTokens: number; effort?: Effort }): GenerateContentConfig {
  return {
    systemInstruction: req.system,
    maxOutputTokens: req.maxTokens,
    ...(req.effort && { thinkingConfig: { thinkingLevel: LEVELS[req.effort] } }),
  };
}

const refused = (res: GenerateContentResponse) => Boolean(res.promptFeedback?.blockReason) || BLOCKED.has(res.candidates?.[0]?.finishReason);

async function track(label: string, model: string, res: GenerateContentResponse | undefined) {
  const u = res?.usageMetadata;
  if (!u) return;
  const cached = u.cachedContentTokenCount ?? 0;
  await recordUsage(
    label,
    model,
    // Thinking tokens are billed as output.
    { input: (u.promptTokenCount ?? 0) - cached, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheRead: cached, cacheWrite: 0 },
    PRICES[model],
  );
}

/** Zod → JSON Schema for `responseJsonSchema` (Gemini rejects the `$schema` keyword). */
function jsonSchema(schema: z.ZodType): unknown {
  const out = z.toJSONSchema(schema);
  delete out.$schema;
  return out;
}

export const gemini: Provider = {
  name: "gemini",
  apiKeyEnv: "GEMINI_API_KEY",
  models,

  async generateJson(req) {
    const model = models[req.tier];
    const res = await api().models.generateContent({
      model,
      contents: req.prompt,
      config: { ...config(req), responseMimeType: "application/json", responseJsonSchema: jsonSchema(req.schema) },
    });
    await track(req.label, model, res);
    if (refused(res) || !res.text) return null;
    try {
      const parsed = req.schema.safeParse(JSON.parse(res.text));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // truncated or malformed JSON
    }
  },

  async *streamText(req, signal) {
    const model = models[req.tier];
    const stream = await api().models.generateContentStream({
      model,
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      config: { ...config(req), abortSignal: signal },
    });
    let last: GenerateContentResponse | undefined;
    for await (const chunk of stream) {
      last = chunk;
      if (chunk.text) yield chunk.text;
    }
    await track(req.label, model, last);
    if (last && refused(last)) yield REFUSAL_NOTE;
  },
};
