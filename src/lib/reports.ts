// Shared by the report dialog (client) and the admin panel (server): keep it free of server imports.

export type ReportKind = "task" | "explanation";
export type ReportStatus = "open" | "resolved" | "rejected";

export const REPORT_REASONS = {
  explanation: {
    wrong_rule: "Неправильне правило чи пояснення",
    contradicts_key: "Суперечить правильній відповіді",
    unclear: "Незрозуміло пояснено",
    typo: "Помилка чи опечатка в тексті",
    other: "Інше",
  },
  task: {
    wrong_key: "Неправильна «правильна відповідь»",
    several_correct: "Підходить кілька варіантів",
    no_correct: "Жоден варіант не підходить",
    unclear: "Незрозуміле формулювання",
    typo: "Помилка чи опечатка в тексті",
    other: "Інше",
  },
} as const satisfies Record<ReportKind, Record<string, string>>;

export const REPORT_KIND_LABEL: Record<string, string> = {
  task: "AI-завдання",
  explanation: "Пояснення",
  ai_reply: "Відповідь AI",
};

export function reasonLabel(kind: string, reason: string | null): string | null {
  if (!reason) return null;
  return (REPORT_REASONS as Record<string, Record<string, string>>)[kind]?.[reason] ?? reason;
}
