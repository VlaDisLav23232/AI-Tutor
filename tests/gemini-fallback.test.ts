import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();
const generateContentStream = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@google/genai")>();
  return {
    ...real,
    GoogleGenAI: class {
      models = { generateContent, generateContentStream };
    },
  };
});
vi.mock("@/lib/ai/usage", () => ({ recordUsage: vi.fn() }));

const { ApiError } = await import("@google/genai");
const { gemini } = await import("@/lib/ai/providers/gemini");

const overloaded = () => new ApiError({ message: "The model is experiencing high demand", status: 503 });
const ok = (text: string) => ({ text, candidates: [{ finishReason: "STOP" }], usageMetadata: {} });
const req = { label: "test", tier: "main" as const, system: "s", maxTokens: 100, schema: z.object({ answer: z.string() }), prompt: "p" };

describe("gemini fallback", () => {
  beforeEach(() => {
    generateContent.mockReset();
    generateContentStream.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("uses 3.8 Flash when it is available", async () => {
    generateContent.mockResolvedValueOnce(ok('{"answer":"А"}'));
    expect(await gemini.generateJson(req)).toEqual({ data: { answer: "А" }, model: "gemini-3.8-flash" });
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.8-flash"]);
  });

  it("switches to 3.6 Flash when 3.8 Flash is overloaded", async () => {
    generateContent.mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(ok('{"answer":"Б"}'));
    expect(await gemini.generateJson(req)).toEqual({ data: { answer: "Б" }, model: "gemini-3.6-flash" });
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.8-flash", "gemini-3.6-flash"]);
  });

  it("does not fall back on errors a different model would not fix", async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: "API key not valid", status: 400 }));
    await expect(gemini.generateJson(req)).rejects.toThrow("API key not valid");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("throws when every model is overloaded", async () => {
    generateContent.mockRejectedValue(overloaded());
    await expect(gemini.generateJson(req)).rejects.toThrow("high demand");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("falls back for the chat stream", async () => {
    async function* chunks() {
      yield ok("При");
      yield ok("віт");
    }
    generateContentStream.mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(chunks());
    const out: string[] = [];
    for await (const t of gemini.streamText({ ...req, messages: [{ role: "user", content: "?" }] }, new AbortController().signal)) out.push(t);
    expect(out.join("")).toBe("Привіт");
    expect(generateContentStream.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.8-flash", "gemini-3.6-flash"]);
  });
});
