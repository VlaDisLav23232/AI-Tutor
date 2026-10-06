"use client";

import { Icon } from "./Icon";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";

function currentTheme(): Theme {
  const set = parseTheme(document.documentElement.dataset.theme);
  if (set) return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Light/dark switch. The choice goes into a cookie so the server renders the right theme with no flash. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  // Both icons are rendered; CSS (.when-dark / .when-light) shows the one for the effective theme.
  return (
    <button type="button" onClick={toggle} aria-label="Змінити тему" title="Світла / темна тема" className={`grid size-9 place-items-center rounded-xl hover:bg-paper-2 ${className}`}>
      <span className="when-dark">
        <Icon name="sun" className="size-5" />
      </span>
      <span className="when-light">
        <Icon name="moon" className="size-5" />
      </span>
    </button>
  );
}
