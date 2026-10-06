// Keyword retrieval over Правопис 2019 § chunks (src/data/rules.json, built by scripts/build-rules.ts).
import MiniSearch from "minisearch";
import rules from "@/data/rules.json";

export interface RuleChunk {
  id: string;
  section: number;
  title: string;
  text: string;
}

// Search terms per category. Lexical categories (stress, idioms, foreign words, sentence order)
// are not covered by the Правопис, so they get no rule context.
const CATEGORY_KEYWORDS: Record<string, string> = {
  apostrophe: "апостроф",
  soft_sign: "м’який знак м'який знак",
  doubled_letters: "подвоєння букв подовження приголосних",
  compound_words_spelling: "складні слова разом через дефіс окремо",
  adverbs_spelling: "прислівники разом через дефіс окремо",
  orthography_sentences: "правопис написання",
  prefix_s_z: "префікси з- с-",
  letter_in_blank: "ненаголошені е и чергування",
  unified_sound: "звук вимова",
  suffix_prefix_meaning: "суфікси",
  patronymics: "імена по батькові",
  word_formation_other: "суфікси творення",
  numeral_noun_agreement: "числівники відмінювання",
  adjective_degrees: "ступені порівняння прикметників вищий найвищий",
  noun_declension: "відмінювання іменників закінчення родового давального",
  verb_forms: "дієслова форми",
  preposition_usage: "прийменники",
  direct_speech: "пряма мова лапки",
  punctuation_error: "кома розділові знаки",
  punctuation_justification: "розділові знаки кома тире двокрапка",
  parenthetical: "вставні слова кома",
  apposition_participle: "прикладка відокремлені означення дієприкметниковий зворот",
  homogeneous_members: "однорідні члени речення кома",
  separated_members_matching: "відокремлені члени речення",
  punctuation_dash_matching: "тире",
  complex_sentence_types_matching: "складне речення кома сполучник",
  subordinate_clause_types_matching: "складнопідрядне речення",
  simple_vs_complex_semantics_matching: "складне речення",
  simple_vs_complex: "складне речення",
};

let index: MiniSearch<RuleChunk> | null = null;
function getIndex() {
  if (!index) {
    index = new MiniSearch<RuleChunk>({
      fields: ["title", "text"],
      storeFields: ["id", "section", "title", "text"],
      searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15 },
    });
    index.addAll(rules as RuleChunk[]);
  }
  return index;
}

export function retrieveRules(categoryLabel: string, taskText: string, k = 3): RuleChunk[] {
  const keywords = CATEGORY_KEYWORDS[categoryLabel];
  if (!keywords) return [];
  const query = `${keywords} ${taskText.replace(/[⟦⟧[\]…]/g, " ").slice(0, 300)}`;
  return (getIndex().search(query, { combineWith: "OR" }) as unknown as RuleChunk[]).slice(0, k);
}

export function formatRules(chunks: RuleChunk[]): string {
  if (!chunks.length) return "Релевантних параграфів Правопису не знайдено.";
  return chunks.map((c) => `### § ${c.section}. ${c.title}\n${c.text.slice(0, 1800)}`).join("\n\n");
}
