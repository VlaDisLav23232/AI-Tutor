import { notFound } from "next/navigation";
import { auth } from "@/auth";

/** Admins are the Google accounts listed in ADMIN_EMAILS (comma-separated). Empty list = nobody. */
export function isAdminEmail(email: string | null | undefined, list = process.env.ADMIN_EMAILS ?? ""): boolean {
  if (!email) return false;
  const admins = list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdminEmail(session?.user?.email);
}

/** For admin pages and server actions: non-admins get a plain 404, so the panel doesn't reveal itself. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) notFound();
}
