// Splits the Правопис 2019 PDF into § chunks for RAG → src/data/rules.json
// Run: npx tsx scripts/build-rules.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// pdf-parse's index.js runs a debug harness when imported directly; the lib entry doesn't.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;

const MAX_CHUNK = 1800;
const ACCENT = String.fromCharCode(0x301);

async function main() {
  const { text: rawText } = await pdf(readFileSync("materials/sdm-ukrayinskii-pravopis-vidannia.pdf"));
  // Stress accents are extracted onto their own lines; glue them back to their vowel.
  const text = rawText.replace(new RegExp(`[ \\t]*\\r?\\n[ \\t]*${ACCENT}[ \\t]*(\\r?\\n[ \\t]*)?`, "g"), ACCENT);
  const lines = text.split(/\r?\n/);

  // Body headings look like "§ 7. Апостроф"; table-of-contents lines contain dot leaders.
  const heading = /^§\s?(\d+)\.\s+(.+)$/;
  const sections: { n: number; title: string; body: string[] }[] = [];
  let expected = 1;
  for (const line of lines) {
    const m = heading.exec(line.trim());
    // A few headings are mangled by extraction, so allow skipping up to two numbers;
    // the skipped section's text then stays in the previous chunk.
    const n = m ? Number(m[1]) : 0;
    if (m && !line.includes("....") && n >= expected && n <= expected + 2) {
      sections.push({ n, title: m[2].trim(), body: [] });
      expected = n + 1;
      continue;
    }
    sections.at(-1)?.body.push(line);
  }

  const chunks: { id: string; section: number; title: string; text: string }[] = [];
  for (const s of sections) {
    const body = s.body.join("\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
    // Split long sections at paragraph boundaries so each chunk stays focused.
    let part = "";
    let k = 0;
    for (const para of body.split("\n")) {
      if (part.length + para.length > MAX_CHUNK && part) {
        chunks.push({ id: `${s.n}-${k++}`, section: s.n, title: s.title, text: part.trim() });
        part = "";
      }
      part += para + "\n";
    }
    if (part.trim()) chunks.push({ id: `${s.n}-${k}`, section: s.n, title: s.title, text: part.trim() });
  }

  mkdirSync("src/data", { recursive: true });
  writeFileSync("src/data/rules.json", JSON.stringify(chunks));
  console.log(`sections: ${sections.length}, chunks: ${chunks.length}`);
}

main();
