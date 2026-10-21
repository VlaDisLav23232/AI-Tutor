// Explanation agent. Goal: an explanation that matches the answer key and gives a short verdict on every option,
// in the style of the task's topic (see PROFILES). Each step the model picks one action; the code runs it:
//   search_rules(query) — more rule fragments (free, local search);
//   check_answer(answer) — "correct"/"wrong" against the key, which the model never sees (free);
//   submit(explanation)  — the code checks the answer, completeness and topic style; rejected with a reason, or accepted.
// Stops when a submission is accepted, or after MAX_WRONG wrong answers / MAX_STEPS steps; then the explanation is
// written with the key and marked "needs_review". The happy path is a single call (submit right away).
// Stress tasks whose words are all in the official list are explained by code, with no AI call.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTaskWithKey } from "@/lib/tasks";
import { formatRules, retrieveRules, searchRules, type RuleChunk } from "@/lib/rag";
import { explainStressFromKb, findHints, idiomMeanings, stressFacts, stressMistakes } from "@/lib/hints";
import type { AgentStep, Answer, ExplanationContent, TaskDTO } from "@/lib/types";
import { AiUnavailableError, aiEnabled, generateJsonWithModel, renderTask } from "./client";

const MAX_STEPS = 5;
const MAX_WRONG = 2;
const MAX_SEARCHES = 2;

// ---------- Topic profiles: how each kind of task is explained ----------

export type Profile = "stress" | "phraseology" | "spelling" | "grammar" | "usage" | "syntax" | "order";

const PROFILE_OF: Record<string, Profile> = {
  stress: "stress",
  phraseology_matching: "phraseology",
  apostrophe: "spelling",
  soft_sign: "spelling",
  prefix_s_z: "spelling",
  doubled_letters: "spelling",
  letter_in_blank: "spelling",
  compound_words_spelling: "spelling",
  adverbs_spelling: "spelling",
  orthography_sentences: "spelling",
  patronymics: "spelling",
  other: "spelling",
  noun_declension: "grammar",
  verb_forms: "grammar",
  numeral_noun_agreement: "grammar",
  adjective_degrees: "grammar",
  word_formation_other: "grammar",
  suffix_prefix_meaning: "grammar",
  parts_of_speech_matching: "grammar",
  unified_sound: "grammar",
  lexical_error: "usage",
  preposition_usage: "usage",
  sentence_editing: "usage",
  foreign_word_equivalent: "usage",
  sentence_order: "order",
};
/** Every other topic (punctuation, sentence structure) is explained as syntax. */
export const profileOf = (categoryLabel: string): Profile => PROFILE_OF[categoryLabel] ?? "syntax";

const PROFILES: Record<Profile, string> = {
  stress: `Тема — наголос. Жодних правил і теорії.
why: у рядку з помилкою назви слово з неправильним наголосом і як правильно; у правильному рядку — що всі наголоси правильні.
Слово з правильним наголосом пиши з великою наголошеною голосною: кропивА, черговИй. Наголоси бери лише зі «Списку наголосів», нічого не вигадуй.
takeaway — мнемоніка для слова з помилкою: рима, асоціація, пара за значенням або спільний візерунок слів. Якщо в «Підказках» є готова — бери її.`,
  phraseology: `Тема — фразеологізми. why — лише значення фразеологізму або синонім, яким його можна замінити в реченні (напр. «червоніти від сорому»).
Без походження, буквального значення й загальних порад. takeaway — порожній рядок.`,
  spelling: `Тема — правопис. why: назви конкретне слово і швидку перевірку (зміни форму, розбери на частини, порівняй з відомим словом), без теорії.
takeaway — мнемоніка або правило-підказка. Якщо в «Підказках» є готова — бери її.`,
  grammar: `Тема — форми слів. why: назви форму і швидкий тест, яким її перевірити (питання, підстановка, зміна числа чи роду).
takeaway — цей тест одним реченням. Якщо в «Підказках» є готовий — бери його.`,
  usage: `Тема — слововживання. why: для неправильного — що саме не так (калька, паронім, зайве слово) і як сказати правильно; для правильного — чому так кажуть українською.
takeaway — пара «так не кажуть → так кажуть» або підказка з «Підказок».`,
  syntax: `Тема — синтаксис і пунктуація. why: який знак чи конструкція тут і яке питання-тест це вирішує.
takeaway — цей тест одним реченням. Якщо в «Підказках» є готовий — бери його.`,
  order: `Тема — порядок речень. why: для неправильного рядка — де рветься логіка (яке речення не може стояти після якого і чому: займенник, сполучник, тема); для правильного — ланцюжок зв'язків.
takeaway — як знайти перше речення.`,
};

const FORMAT = `Формат пояснення:
- options: для КОЖНОГО варіанта — letter, correct (true лише для правильного) і why: 1–2 короткі речення по суті, з конкретним словом чи місцем із варіанта. Не переказуй підручник і не починай з визначень: пиши живо, на «ти», як репетитор.
- takeaway: одне речення, яке учень застосує на іспиті.
- Для завдань на відповідність замість options заповни items: для кожного пункту — item, letter і why (продовження фрази «1 — Г, бо …», без самого «бо»).
- Нічого не виділяй дужками ⟦…⟧. Слова, про які говориш, бери в лапки «…».
Не згадуй, звідки правило, не пиши «§» і «правопис».`;

// ---------- Output schemas ----------

const explanationFields = {
  options: z
    .array(z.object({ letter: z.string(), correct: z.boolean(), why: z.string() }))
    .describe("Для кожного варіанта (крім завдань на відповідність): чи правильний і чому, 1–2 речення"),
  items: z
    .array(z.object({ item: z.string(), letter: z.string(), why: z.string() }))
    .describe("Лише для відповідностей: для кожного пункту 1–4 — літера і пояснення без слова «бо»"),
  takeaway: z.string().describe("Підказка чи мнемоніка одним реченням або порожній рядок"),
};

/** Used only for the fallback, when the explanation is written with the key. */
const ExplanationSchema = z.object(explanationFields);
type ExplanationOutput = z.infer<typeof ExplanationSchema>;

// A flat object rather than a union: every provider's structured output supports it. Unused fields stay empty.
const StepSchema = z.object({
  action: z.enum(["search_rules", "check_answer", "submit"]),
  query: z.string().describe("Лише для search_rules: що шукати в правилах, 3–8 слів. Інакше порожній рядок"),
  answer: z.string().describe("Для check_answer і submit: літера твоєї відповіді (для відповідностей — порожній рядок, пункти в items)"),
  ...explanationFields,
});
type StepOutput = z.infer<typeof StepSchema>;

const AGENT_INSTRUCTIONS = `Ти — агент, що готує пояснення до завдання НМТ. Ключа ти не бачиш: розв'яжи завдання сам.
Щокроку обери одну дію (поле action):
- submit — надіслати відповідь і повне пояснення. Код перевірить відповідь за ключем, повноту і стиль пояснення. Якщо ти впевнений, роби submit одразу: це найдешевше.
- check_answer — лише перевірити відповідь (answer або items) за ключем, без пояснення. Корисно, якщо вагаєшся між варіантами.
- search_rules — знайти інше правило (query: 3–8 слів). Корисно, якщо довідка не про те, що перевіряє завдання.
Якщо відповідь виявилась неправильною, не повторюй її: подумай, що ти застосував хибно, за потреби знайди інше правило і розв'яжи заново.
Для дій search_rules і check_answer поля пояснення залиш порожніми.`;

const KEY_INSTRUCTIONS = `Правильна відповідь подана в завданні — вона істина, ніколи їй не суперечиш і не пиши про сумніви щодо ключа. Поясни учневі завдання.`;

/** Knowledge the model must rely on: mnemonics, the official stress list, idiom meanings and rule fragments. */
function grounding(task: TaskDTO, profile: Profile, chunks: RuleChunk[]): string {
  const blocks: string[] = [];
  const hints = findHints(task);
  if (hints.length) blocks.push(`Підказки (можна брати дослівно):\n${hints.map((h) => `- ${h}`).join("\n")}`);
  if (profile === "stress") {
    const facts = stressFacts(task);
    if (facts.length) blocks.push(`Список наголосів НМТ (це істина):\n${facts.join(", ")}`);
  }
  if (profile === "phraseology") {
    const meanings = idiomMeanings(task);
    if (meanings.length) blocks.push(`Значення фразеологізмів (це істина):\n${meanings.join("\n")}`);
  }
  if (chunks.length) blocks.push(`Довідка для тебе (не цитуй і не згадуй):\n${formatRules(chunks)}`);
  return blocks.join("\n\n");
}

// ---------- Checks done by code (the agent's tools) ----------

/** Number of wrong parts: 0 or 1 for single choice, wrong items for matching. */
export function wrongParts(out: Pick<StepOutput, "answer" | "items">, key: Answer): number {
  if (typeof key === "string") return out.answer.trim().toUpperCase() === key ? 0 : 1;
  return Object.entries(key).filter(([item, letter]) => out.items.find((p) => p.item.trim() === item)?.letter.trim().toUpperCase() !== letter).length;
}

function answerFeedback(wrong: number, key: Answer): string {
  if (wrong === 0) return "правильно";
  return typeof key === "string" ? "неправильно" : `неправильно: помилка в ${wrong} з ${Object.keys(key).length} пунктів`;
}

const ETYMOLOGY = /походить|походж|буквальн|міфолог|етимолог|первісн/i;

/** What is wrong with a submitted explanation; empty when it can be shown to students. */
export function missingParts(out: ExplanationOutput, task: TaskDTO, key: Answer, profile: Profile): string[] {
  const problems: string[] = [];
  if (typeof key === "string") {
    const explained = new Set(out.options.filter((o) => o.why.trim().length >= 15).map((o) => o.letter.trim().toUpperCase()));
    const missing = Object.keys(task.options).filter((l) => !explained.has(l));
    if (missing.length) problems.push(`не пояснено варіанти ${missing.join(", ")}`);
    if (out.options.some((o) => o.why.length > 400)) problems.push("скороти пояснення варіантів до 1–2 речень");
  } else {
    const missing = Object.keys(key).filter((item) => !out.items.find((p) => p.item.trim() === item && p.why.trim().length >= 8));
    if (missing.length) problems.push(`не пояснено пункти ${missing.join(", ")}`);
  }
  if (out.takeaway.length > 300) problems.push("скороти takeaway до одного речення");

  const whys = [...out.options.map((o) => o.why), ...out.items.map((p) => p.why)];
  const text = [...whys, out.takeaway].join(" ");
  if (/§|правопис/i.test(text)) problems.push("прибери згадки про параграфи і правопис");
  if (profile === "phraseology" && whys.some((w) => ETYMOLOGY.test(w))) problems.push("без походження й буквального значення — лише значення або синонім");
  if (profile === "stress") {
    const wrongStress = stressMistakes(text);
    if (wrongStress.length) problems.push(`неправильний наголос у ${wrongStress.join(", ")} — звір зі «Списком наголосів»`);
  }
  return problems;
}

/**
 * Explanations carry no ⟦…⟧ marks: drops any the model wrote anyway (often copied from the task text).
 */
export function cleanMarks(text: string): string {
  return text.replace(/[⟦⟧]/g, "");
}

/** Normalises a checked submission: verdicts follow the key, empty fields become null. */
function toContent(out: ExplanationOutput, key: Answer, profile: Profile): ExplanationContent {
  const isMatching = typeof key !== "string";
  const options = isMatching
    ? []
    : out.options.map((o) => {
        const letter = o.letter.trim().toUpperCase();
        return { letter, correct: letter === key, why: cleanMarks(o.why.trim()) };
      });
  const takeaway = out.takeaway.trim();
  return {
    v: 2,
    options,
    items: isMatching ? out.items.map((p) => ({ item: p.item.trim(), letter: p.letter.trim().toUpperCase(), why: cleanMarks(p.why.trim().replace(/^бо[\s,]+/i, "")) })) : [],
    takeaway: profile === "phraseology" || !takeaway ? null : cleanMarks(takeaway),
  };
}

const describeAnswer = (out: Pick<StepOutput, "answer" | "items">, key: Answer) =>
  typeof key === "string" ? out.answer.trim().toUpperCase() : out.items.map((p) => `${p.item.trim()}–${p.letter.trim()}`).join(", ");

// ---------- The loop ----------

async function explainWithKey(task: TaskDTO, key: Answer, profile: Profile, chunks: RuleChunk[]) {
  const { data, model } = await generateJsonWithModel({
    label: "explain(with key)",
    tier: "main",
    maxTokens: 8000,
    effort: "medium",
    schema: ExplanationSchema,
    prompt: `${KEY_INSTRUCTIONS}\n\n${FORMAT}\n\n${PROFILES[profile]}\n\n${grounding(task, profile, chunks)}\n\n${renderTask(task, key)}`,
  });
  if (!data) throw new Error("explain(with key) failed: refused or unusable output");
  return { content: toContent(data, key, profile), model };
}

async function save(taskId: string, content: ExplanationContent, status: string, model: string) {
  return prisma.explanation.upsert({
    where: { taskId },
    create: { taskId, content: content as object, status, model },
    update: { content: content as object, status, model },
  });
}

export async function generateExplanation(taskId: string, onStep: (s: AgentStep) => void = () => {}) {
  const found = await getTaskWithKey(taskId);
  if (!found) throw new Error(`task ${taskId} not found`);
  const { task, answer: key } = found;
  const profile = profileOf(task.categoryLabel);

  if (profile === "stress") {
    const fromList = explainStressFromKb(task, key);
    if (fromList) {
      onStep({ kind: "start", text: "Звіряю кожне слово зі списком наголосів НМТ" });
      onStep({ kind: "done", ok: true, text: "Пояснення готове" });
      return save(taskId, fromList, "verified", "knowledge-base");
    }
  }
  if (!aiEnabled()) throw new AiUnavailableError();

  onStep({ kind: "start", text: "Читаю завдання й добираю підказки" });
  const chunks: RuleChunk[] = retrieveRules(task.categoryLabel, `${task.question} ${Object.values(task.options).join(" ")}`);
  const log: string[] = [];
  const wrongAnswers = new Set<string>();
  let searches = 0;
  let answerConfirmed = false;
  let result: { content: ExplanationContent; model: string } | null = null;

  for (let step = 1; step <= MAX_STEPS && wrongAnswers.size < MAX_WRONG && !result; step++) {
    const journal = log.length ? log.map((l, i) => `${i + 1}. ${l}`).join("\n") : "(ще нічого не зроблено)";
    const { data: out, model } = await generateJsonWithModel({
      label: `explain-agent(step ${step})`,
      tier: "main",
      maxTokens: 8000,
      effort: "medium",
      schema: StepSchema,
      prompt: `${AGENT_INSTRUCTIONS}\n\n${FORMAT}\n\n${PROFILES[profile]}\n\n${grounding(task, profile, chunks)}\n\n${renderTask(task)}\n\nЖурнал твоїх дій:\n${journal}\n\nЗалишилось кроків: ${MAX_STEPS - step + 1}. Обери наступну дію.`,
    });
    if (!out) {
      log.push("відповідь не розпізнано, спробуй ще раз");
      continue;
    }

    if (out.action === "search_rules") {
      const query = out.query.trim();
      if (searches >= MAX_SEARCHES || !query) {
        log.push(`search_rules → ${query ? "ліміт пошуку вичерпано" : "порожній запит"}; розв'язуй з тим, що є`);
        continue;
      }
      searches++;
      const added = searchRules(query, new Set(chunks.map((c) => c.id)));
      chunks.push(...added);
      log.push(`search_rules «${query}» → ${added.length ? `додано ${added.length} фрагменти до довідки` : "нічого нового"}`);
      // Student-facing steps stay neutral: failed checks are for the agent's journal, not the student.
      onStep({ kind: "search", text: `Шукаю правило: «${query}»` });
      continue;
    }

    const given = describeAnswer(out, key);
    if (wrongAnswers.has(given)) {
      log.push(`${out.action} ${given} → ти вже перевіряв цю відповідь, вона неправильна`);
      continue;
    }
    const wrong = wrongParts(out, key);
    if (wrong > 0) {
      wrongAnswers.add(given);
      log.push(`${out.action} ${given} → ${answerFeedback(wrong, key)}`);
      onStep({ kind: "check", text: "Перевіряю інші варіанти" });
      continue;
    }
    answerConfirmed = true;

    if (out.action === "check_answer") {
      log.push(`check_answer ${given} → правильно; тепер зроби submit з поясненням`);
      onStep({ kind: "check", ok: true, text: `Відповідь ${given} збіглася з ключем` });
      continue;
    }

    const problems = missingParts(out, task, key, profile);
    if (problems.length) {
      log.push(`submit ${given} → відповідь правильна, але пояснення відхилено: ${problems.join("; ")}`);
      onStep({ kind: "submit", text: "Доповнюю пояснення" });
      continue;
    }
    onStep({ kind: "check", ok: true, text: `Відповідь ${given} збіглася з ключем` });
    result = { content: toContent(out, key, profile), model };
  }

  let status = "verified";
  if (!result) {
    onStep({ kind: "fallback", text: "Звіряюся з правильною відповіддю" });
    result = await explainWithKey(task, key, profile, chunks);
    // The key was reached blind, only the write-up failed: still a verified solution.
    if (!answerConfirmed) status = "needs_review";
  }
  onStep({ kind: "done", ok: true, text: "Пояснення готове" });
  return save(taskId, result.content, status, result.model);
}
