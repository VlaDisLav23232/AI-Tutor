// Deletes all AI-made content: every cached explanation and every AI-generated task (with attempts on them
// and their ids in runs). Real tasks, users and their other progress stay. Explanations are regenerated on demand.
// Run: npm run db:clear-ai -- --yes (uses DATABASE_URL)
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { dbLabel, deleteTasks } from "./delete-tasks";

async function main() {
  const explanations = await prisma.explanation.count();
  const generated = (await prisma.task.findMany({ where: { source: "generated" }, select: { id: true } })).map((t) => t.id);
  console.log(`database: ${dbLabel()}`);
  console.log(`explanations: ${explanations}, AI-generated tasks: ${generated.length}`);
  if (!process.argv.includes("--yes")) {
    console.log("Nothing deleted. Re-run with --yes to delete them.");
    return;
  }

  const { count } = await prisma.explanation.deleteMany({});
  const removed = await deleteTasks(generated);
  console.log(`deleted ${count} explanations and ${removed} AI-generated tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
