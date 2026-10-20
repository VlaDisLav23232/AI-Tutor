// "Поясни інакше" and free-form questions about one task, streamed from the main model.
import { prisma } from "@/lib/db";
import { getTaskWithKey } from "@/lib/tasks";
import { formatRules, retrieveRules } from "@/lib/rag";
import { isCurrentExplanation } from "@/lib/types";
import { AiUnavailableError, aiEnabled, formatAnswer, renderTask, streamText, type ChatTurn } from "./client";

export type { ChatTurn };

export const MAX_TURNS = 10;

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
  const content = isCurrentExplanation(explanation?.content) ? explanation.content : undefined;
  const correct = content?.options.find((o) => o.correct)?.why ?? content?.items.map((p) => `${p.item} — ${p.letter}: ${p.why}`).join("\n");
  const rules = formatRules(retrieveRules(task.categoryLabel, task.question, 2));

  const context = [
    `Учень працює над завданням і ставить тобі питання. Відповідай коротко (до 150 слів), по суті, з прикладами.`,
    opts.revealKey
      ? `Учень уже відповів${opts.studentResponse !== undefined ? ` (його відповідь: ${formatAnswer(opts.studentResponse as never)})` : ""}. Можна пояснювати розв'язок повністю.`
      : `Учень ще НЕ відповів. Не називай правильну відповідь і не вказуй на правильний варіант — лише наводь на думку.`,
    `Довідка для тебе (не цитуй і не згадуй джерело):\n${rules}`,
    content ? `Перевірене пояснення (спирайся на нього):\n${correct}${content.takeaway ? `\n${content.takeaway}` : ""}` : "",
    renderTask(task, answer),
  ]
    .filter(Boolean)
    .join("\n\n");

  const turns = opts.turns.slice(-MAX_TURNS);
  const messages: ChatTurn[] = turns.map((t, i) =>
    i === 0 && t.role === "user" ? { role: "user", content: `${context}\n\nПитання учня: ${t.content}` } : t,
  );

  const abort = new AbortController();
  const chunks = await streamText({ label: "chat", tier: "main", maxTokens: 2000, effort: "low", messages }, abort.signal);

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of chunks) controller.enqueue(encoder.encode(text));
      } catch (e) {
        console.error(e);
        controller.enqueue(encoder.encode("\n\n(Сталася помилка AI. Спробуй ще раз.)"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
}
