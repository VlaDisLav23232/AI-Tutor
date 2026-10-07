// "Поясни інакше" and free-form questions about one task, streamed from Sonnet.
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getTaskWithKey } from "@/lib/tasks";
import { formatRules, retrieveRules } from "@/lib/rag";
import type { ExplanationContent } from "@/lib/types";
import { AiUnavailableError, aiEnabled, claude, formatAnswer, MODEL_MAIN, renderTask, systemBlocks, trackUsage } from "./client";

export const MAX_TURNS = 10;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Streams the tutor's reply as plain text. `revealKey` is false until the student has answered:
 * then the model knows the key but must only guide, not tell.
 */
export async function streamTaskChat(opts: {
  taskId: string;
  turns: ChatTurn[];
  revealKey: boolean;
  studentResponse?: unknown;
}): Promise<ReadableStream<Uint8Array>> {
  if (!aiEnabled()) throw new AiUnavailableError();
  const found = await getTaskWithKey(opts.taskId);
  if (!found) throw new Error("task not found");
  const { task, answer } = found;
  const explanation = await prisma.explanation.findUnique({ where: { taskId: task.id } });
  const content = explanation?.content as ExplanationContent | undefined;
  const rules = formatRules(retrieveRules(task.categoryLabel, task.question, 2));

  const context = [
    `Учень працює над завданням і ставить тобі питання. Відповідай коротко (до 150 слів), по суті, з прикладами.`,
    opts.revealKey
      ? `Учень уже відповів${opts.studentResponse !== undefined ? ` (його відповідь: ${formatAnswer(opts.studentResponse as never)})` : ""}. Можна пояснювати розв'язок повністю.`
      : `Учень ще НЕ відповів. Не називай правильну відповідь і не вказуй на правильний варіант — лише наводь на думку.`,
    `Довідка для тебе (не цитуй і не згадуй джерело):\n${rules}`,
    content ? `Перевірене пояснення (спирайся на нього):\n${content.rule}\n${content.whyCorrect}` : "",
    renderTask(task, answer),
  ]
    .filter(Boolean)
    .join("\n\n");

  const turns = opts.turns.slice(-MAX_TURNS);
  const messages: Anthropic.MessageParam[] = turns.map((t, i) =>
    i === 0 && t.role === "user" ? { role: "user", content: `${context}\n\nПитання учня: ${t.content}` } : { role: t.role, content: t.content },
  );

  const stream = (await claude()).messages.stream({
    model: MODEL_MAIN,
    max_tokens: 2000,
    system: systemBlocks,
    output_config: { effort: "low" },
    messages,
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        await trackUsage("chat", MODEL_MAIN, final.usage);
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n(AI не зміг відповісти на це питання.)"));
      } catch (e) {
        console.error(e);
        controller.enqueue(encoder.encode("\n\n(Сталася помилка AI. Спробуй ще раз.)"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });
}
