// Shared by seed.ts and clear-ai.ts: removes tasks together with everything that points at them.
import { prisma } from "../src/lib/db";

/** Deletes the tasks, their AI twins, attempts on them (no FK cascade there) and their ids in runs. Returns the count. */
export async function deleteTasks(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const twins = await prisma.task.findMany({ where: { parentTaskId: { in: ids } }, select: { id: true } });
  const all = [...new Set([...ids, ...twins.map((t) => t.id)])];
  await prisma.attempt.deleteMany({ where: { taskId: { in: all } } });
  // Explanations and saved tasks cascade.
  const { count } = await prisma.task.deleteMany({ where: { id: { in: all } } });
  await prisma.$executeRaw`
    UPDATE "TestRun" SET "taskIds" = ARRAY(SELECT x FROM unnest("taskIds") AS x WHERE x <> ALL(${all}::text[]))
    WHERE "taskIds" && ${all}::text[]`;
  return count;
}

/** "localhost:51214/template1" or "ep-xyz.neon.tech/neondb" — printed so it's clear which database a script touches. */
export function dbLabel(): string {
  const m = /@([^/?]+)\/([^?]*)/.exec(process.env.DATABASE_URL ?? "");
  return m ? `${m[1]}/${m[2]}` : "(DATABASE_URL not set)";
}
