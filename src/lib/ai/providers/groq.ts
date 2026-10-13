import OpenAI from "openai";
import { z } from "zod";
import { recordUsage, type Prices } from "../usage";
import { REFUSAL_NOTE, type Provider, type Tier } from "./types";

// Groq speaks the OpenAI API, so the official OpenAI SDK is pointed at its endpoint.
const models: Record<Tier, string> = {
  main: process.env.GROQ_MODEL_MAIN ?? "openai/gpt-oss-120b",
  fast: process.env.GROQ_MODEL_FAST ?? "openai/gpt-oss-20b",
};

// Optional output cap. gpt-oss reasons before it writes the answer and the reasoning counts towards
// the cap, so a low cap cuts the JSON off on harder tasks (Groq then fails with json_validate_failed).
const MAX_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || Infinity;

// Free tier: nothing is charged. Fill in paid prices here if the account is upgraded.
const PRICES: Record<string, Prices> = {};

let client: OpenAI | null = null;
function api(): OpenAI {
  // The free tier allows 8K tokens a minute and one explanation call can use most of it, so a second
  // call in the same minute (re-explaining with the key) is rate-limited. The SDK waits for the reset
  // Groq announces and tries again; more retries than the default 2 let it ride out a whole minute.
  if (!client) client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", maxRetries: 6 });
  return client;
}

async function track(label: string, model: string, u: OpenAI.CompletionUsage | undefined | null) {
  if (!u) return;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  await recordUsage(label, model, { input: u.prompt_tokens - cached, output: u.completion_tokens, cacheRead: cached, cacheWrite: 0 }, PRICES[model]);
}

export const groq: Provider = {
  name: "groq",
  apiKeyEnv: "GROQ_API_KEY",
  models,

  async generateJson(req) {
    const model = models[req.tier];
    const schema = z.toJSONSchema(req.schema);
    delete schema.$schema;
    const res = await api().chat.completions.create({
      model,
      max_completion_tokens: Math.min(req.maxTokens, MAX_TOKENS),
      reasoning_effort: req.effort,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema } },
    });
    await track(req.label, model, res.usage);
    const msg = res.choices[0]?.message;
    if (!msg?.content || msg.refusal || res.choices[0].finish_reason === "content_filter") return { data: null, model };
    try {
      const parsed = req.schema.safeParse(JSON.parse(msg.content));
      return { data: parsed.success ? parsed.data : null, model };
    } catch {
      return { data: null, model }; // truncated or malformed JSON
    }
  },

  async *streamText(req, signal) {
    const model = models[req.tier];
    const stream = await api().chat.completions.create(
      {
        model,
        max_completion_tokens: Math.min(req.maxTokens, MAX_TOKENS),
        reasoning_effort: req.effort,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );
    let usage: OpenAI.CompletionUsage | undefined;
    let filtered = false;
    for await (const chunk of stream) {
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices[0];
      if (choice?.finish_reason === "content_filter") filtered = true;
      if (choice?.delta.content) yield choice.delta.content;
    }
    await track(req.label, model, usage);
    if (filtered) yield REFUSAL_NOTE;
  },
};
