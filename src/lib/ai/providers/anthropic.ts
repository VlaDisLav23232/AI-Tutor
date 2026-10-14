import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { recordUsage, type Prices } from "../usage";
import { REFUSAL_NOTE, type Provider, type Tier } from "./types";

const models: Record<Tier, string> = {
  main: process.env.ANTHROPIC_MODEL_MAIN ?? "claude-haiku-5-5",
  fast: process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5",
};

const PRICES: Record<string, Prices> = {
  "claude-sonnet-5-5": [2, 10, 0.1, 2.5],
  // Prompts up to 100K tokens; longer ones cost 5x, which the app's prompts never reach.
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "claude-haiku-4-5": [1, 5, 0.1, 1.25],
};

let client: Anthropic | null = null;
function api(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const track = (label: string, model: string, u: Anthropic.Usage) =>
  recordUsage(
    label,
    model,
    { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    PRICES[model],
  );

// The system prompt is identical across calls, so it is cached.
const systemBlocks = (text: string) => [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } }];

export const anthropic: Provider = {
  name: "anthropic",
  apiKeyEnv: "ANTHROPIC_API_KEY",
  models,

  async generateJson(req) {
    const model = models[req.tier];
    const res = await api().messages.parse({
      model,
      max_tokens: req.maxTokens,
      system: systemBlocks(req.system),
      output_config: { effort: req.effort, format: zodOutputFormat(req.schema) },
      messages: [{ role: "user", content: req.prompt }],
    });
    await track(req.label, model, res.usage);
    return { data: res.stop_reason === "refusal" ? null : (res.parsed_output ?? null), model };
  },

  async *streamText(req, signal) {
    const model = models[req.tier];
    const stream = api().messages.stream(
      {
        model,
        max_tokens: req.maxTokens,
        system: systemBlocks(req.system),
        output_config: { effort: req.effort },
        messages: req.messages,
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    await track(req.label, model, final.usage);
    if (final.stop_reason === "refusal") yield REFUSAL_NOTE;
  },
};
