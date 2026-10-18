import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export default async function Admin() {
  await requireAdmin();
  redirect("/admin/reports");
}
