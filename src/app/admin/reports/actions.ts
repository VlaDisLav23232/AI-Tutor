"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// Server actions are plain POST endpoints: every one re-checks the admin list itself.

const Status = z.enum(["open", "resolved", "rejected"]);
const Group = z.object({ taskId: z.string().min(1), kind: z.string().min(1), from: Status, to: Status });

/** Moves every report of one task+kind from one status to another (a card in the panel is such a group). */
export async function setGroupStatus(formData: FormData) {
  await requireAdmin();
  const { taskId, kind, from, to } = Group.parse(Object.fromEntries(formData));
  await prisma.report.updateMany({
    where: { taskId, kind, status: from },
    data: { status: to, resolvedAt: to === "open" ? null : new Date() },
  });
  revalidatePath("/admin/reports");
}

/** Drops the saved explanation: the next student who asks gets a freshly generated one. */
export async function deleteExplanation(formData: FormData) {
  await requireAdmin();
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  await prisma.$transaction([
    prisma.explanation.deleteMany({ where: { taskId } }),
    prisma.report.updateMany({ where: { taskId, kind: "explanation", status: "open" }, data: { status: "resolved", resolvedAt: new Date() } }),
  ]);
  revalidatePath("/admin/reports");
}

/** Takes a generated task out of circulation. Official NMT tasks are never hidden this way. */
export async function hideGeneratedTask(formData: FormData) {
  await requireAdmin();
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  await prisma.$transaction([
    prisma.task.updateMany({ where: { id: taskId, source: "generated" }, data: { verified: false } }),
    prisma.report.updateMany({ where: { taskId, kind: "task", status: "open" }, data: { status: "resolved", resolvedAt: new Date() } }),
  ]);
  revalidatePath("/admin/reports");
}
