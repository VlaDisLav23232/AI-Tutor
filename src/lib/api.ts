import { NextResponse } from "next/server";
import { currentUserId } from "@/auth";
import { AiUnavailableError } from "./ai/client";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Wraps a route handler: resolves the signed-in user and maps known errors to HTTP codes. */
export function withUser<A extends unknown[]>(handler: (userId: string, ...args: A) => Promise<Response>) {
  return async (...args: A) => {
    const userId = await currentUserId();
    if (!userId) return jsonError(401, "Потрібно увійти");
    try {
      return await handler(userId, ...args);
    } catch (e) {
      if (e instanceof AiUnavailableError) return jsonError(503, e.message);
      console.error(e);
      return jsonError(500, "Щось пішло не так на сервері. Спробуй ще раз.");
    }
  };
}

// In-memory per-user limiter for AI endpoints. Good enough for one server instance / an MVP.
const AI_CALLS_PER_HOUR = 60;
const calls = new Map<string, number[]>();
export function aiRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= AI_CALLS_PER_HOUR) return true;
  recent.push(now);
  calls.set(userId, recent);
  return false;
}
