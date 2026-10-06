import { requireUserId } from "@/auth";
import { prisma } from "@/lib/db";
import { SavedList, type SavedItem } from "@/components/SavedList";

export default async function Saved({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const userId = await requireUserId();
  const tab = (await searchParams).tab === "repeat" ? "repeat" : "favorite";
  const rows = await prisma.savedTask.findMany({
    where: { userId },
    include: { task: { include: { category: true } } },
    orderBy: { createdAt: "desc" },
  });
  const items: SavedItem[] = rows.map((r) => ({
    taskId: r.taskId,
    kind: r.kind as SavedItem["kind"],
    topic: r.task.category.nameUa,
    question: r.task.question,
    firstOption: Object.values(r.task.options as Record<string, string>)[0] ?? "",
  }));
  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Збережені завдання</h1>
      <p className="mt-1 text-ink-soft">
        ★ — обрані, щоб повернутися до них будь-коли. ! — «дай мені це завдання ще раз»: практика підсуне його першочергово, а після
        правильної відповіді позначка зникне.
      </p>
      <SavedList items={items} initialTab={tab} />
    </div>
  );
}
