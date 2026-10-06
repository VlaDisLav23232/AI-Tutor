"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Головна", icon: "home" },
  { href: "/practice", label: "Практика", icon: "bolt" },
  { href: "/topics", label: "Теми", icon: "grid" },
  { href: "/saved", label: "Збережені", icon: "star" },
  { href: "/exam", label: "Варіант", icon: "sheet" },
];

/** Solving screens run in focus mode: no navigation, just the task and an exit. */
function isFocusMode(path: string) {
  return path === "/practice" || (path.startsWith("/run/") && !path.endsWith("/result"));
}

export function Nav() {
  const path = usePathname();
  if (isFocusMode(path)) return null;
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <>
      {/* Desktop: top bar */}
      <header className="hidden border-b border-grid md:block">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/dashboard" className="font-display text-lg font-bold tracking-tight">
            Бланк
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm ${isActive(i.href) ? "bg-ink text-on-ink" : "hover:bg-paper-2"}`}
              >
                <Icon name={i.icon} className="size-4" filled={i.icon === "star" && isActive(i.href)} />
                {i.label}
              </Link>
            ))}
            <ThemeToggle className="ml-2" />
          </div>
        </nav>
      </header>
      {/* Mobile: slim top bar for the logo and theme switch */}
      <header className="flex items-center justify-between border-b border-grid px-4 py-1.5 md:hidden">
        <Link href="/dashboard" className="font-display text-lg font-bold tracking-tight">
          Бланк
        </Link>
        <ThemeToggle />
      </header>
      {/* Mobile: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-grid bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[11px] ${isActive(i.href) ? "font-bold text-ink" : "text-ink-soft"}`}
          >
            <Icon name={i.icon} className="size-5" filled={isActive(i.href) && (i.icon === "star" || i.icon === "bolt")} />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
