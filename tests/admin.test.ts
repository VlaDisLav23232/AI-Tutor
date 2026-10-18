import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
const { isAdminEmail } = await import("@/lib/admin");

describe("isAdminEmail", () => {
  const list = " Admin@Gmail.com , second@ukr.net,,";

  it("matches listed emails regardless of case and spaces", () => {
    expect(isAdminEmail("admin@gmail.com", list)).toBe(true);
    expect(isAdminEmail(" SECOND@ukr.net ", list)).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isAdminEmail("student@gmail.com", list)).toBe(false);
    expect(isAdminEmail("admin@gmail.co", list)).toBe(false);
    expect(isAdminEmail(null, list)).toBe(false);
    expect(isAdminEmail(undefined, list)).toBe(false);
  });

  it("an empty list means no admins, not everyone", () => {
    expect(isAdminEmail("admin@gmail.com", "")).toBe(false);
    expect(isAdminEmail("", "")).toBe(false);
    expect(isAdminEmail("", ",")).toBe(false);
  });
});
