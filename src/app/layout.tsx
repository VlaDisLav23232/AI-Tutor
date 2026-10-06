import type { Metadata, Viewport } from "next";
import { Literata, Unbounded } from "next/font/google";
import { auth } from "@/auth";
import { Nav } from "@/components/Nav";
import "./globals.css";

const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin", "cyrillic"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Бланк — підготовка до НМТ з української",
  description: "Тести НМТ з української мови з поясненнями, практикою на помилках і прогнозом балу.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="uk" className={`${unbounded.variable} ${literata.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {session?.user && <Nav />}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 md:pb-12">{children}</main>
      </body>
    </html>
  );
}
