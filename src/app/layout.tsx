import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import { auth } from "@/auth";
import { Nav } from "@/components/Nav";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

// Fixel ships two optical cuts: Text for reading sizes, Display for headings, buttons and sheet labels.
const fixelText = localFont({
  variable: "--font-fixel-text",
  fallback: ["system-ui", "sans-serif"],
  src: [
    { path: "../components/fonts/FixelText/FixelText-Regular.woff2", weight: "400", style: "normal" },
    { path: "../components/fonts/FixelText/FixelText-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../components/fonts/FixelText/FixelText-Medium.woff2", weight: "500", style: "normal" },
    { path: "../components/fonts/FixelText/FixelText-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../components/fonts/FixelText/FixelText-Bold.woff2", weight: "700", style: "normal" },
  ],
});
const fixelDisplay = localFont({
  variable: "--font-fixel-display",
  fallback: ["system-ui", "sans-serif"],
  src: [
    { path: "../components/fonts/FixelDisplay/FixelDisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "../components/fonts/FixelDisplay/FixelDisplay-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../components/fonts/FixelDisplay/FixelDisplay-Bold.woff2", weight: "700", style: "normal" },
    { path: "../components/fonts/FixelDisplay/FixelDisplay-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Бланк — підготовка до НМТ з української",
  description: "Тести НМТ з української мови з поясненнями, практикою на помилках і прогнозом балу.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, jar] = await Promise.all([auth(), cookies()]);
  // No cookie = follow the system theme; otherwise the user's explicit choice wins.
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang="uk" data-theme={theme ?? undefined} className={`${fixelText.variable} ${fixelDisplay.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {session?.user && <Nav />}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 md:pb-12">{children}</main>
      </body>
    </html>
  );
}
