import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

const providers = [Google];
if (devLoginEnabled) {
  // Local testing without Google OAuth credentials: signs in as a fixed demo user.
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: {},
      async authorize() {
        const email = "demo@nmt.local";
        return prisma.user.upsert({ where: { email }, create: { email, name: "Демо-учень" }, update: {} });
      },
    }) as unknown as typeof Google,
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions so the credentials provider works too; users/accounts still live in Postgres.
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/" },
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** Signed-in user id, or redirect to the landing page. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/");
  return id;
}

/** For route handlers: user id or null (caller returns 401). */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
