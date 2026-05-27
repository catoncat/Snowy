import type { ChatItem } from "./state";

export interface ConversationMarkdownInput {
  title: string;
  sessionId?: string | null;
  items: ChatItem[];
}

function normalizeTitle(title: string): string {
  return title.trim() || "Conversation";
}

export function hasConversationExportContent(items: ChatItem[]): boolean {
  return items.some((item) => item.kind === "message" && item.text.trim().length > 0);
}

export function conversationMarkdownFileName(title: string): string {
  const sourceTitle = title.trim() || "conversation";
  const base = Array.from(sourceTitle)
    .map((char) => (char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? "_" : char))
    .join("")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return `${base || "conversation"}.md`;
}

function messageRoleLabel(role: string): string {
  if (role === "user") {
    return "User";
  }
  if (role === "system") {
    return "System";
  }
  return "Assistant";
}

export function generateConversationMarkdown(input: ConversationMarkdownInput): string {
  const lines: string[] = [`# ${normalizeTitle(input.title)}`, ""];

  for (const item of input.items) {
    if (item.kind !== "message") {
      continue;
    }
    const text = item.text.trim();
    if (!text) {
      continue;
    }
    lines.push(`**${messageRoleLabel(item.role)}**: ${text}`, "");
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
