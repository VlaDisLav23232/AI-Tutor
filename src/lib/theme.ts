export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";

export function parseTheme(v: string | undefined): Theme | null {
  return v === "light" || v === "dark" ? v : null;
}
