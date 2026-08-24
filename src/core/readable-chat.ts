import type { ChatMessage } from "./types";

function frontmatterValue(content: string, key: string): unknown {
	const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
	if (!match?.[1]) return undefined;
	try {
		return JSON.parse(match[1]);
	} catch {
		return match[1].trim();
	}
}

export function parseReadableChat(content: string): Record<string, unknown> | null {
	const id = frontmatterValue(content, "id");
	if (typeof id !== "string" || !id.trim()) return null;
	const messages: ChatMessage[] = [];
	const messagePattern = /^## (You|Agent)\s*\n\n([\s\S]*?)(?=\n## (?:You|Agent)\s*\n\n|\n## Activity summary\s*\n\n|$)/gm;
	for (const match of content.matchAll(messagePattern)) {
		const role = match[1] === "You" ? "user" : "assistant";
		const text = match[2]?.trim();
		if (text) messages.push({ role, content: text });
	}
	const updated = frontmatterValue(content, "updated");
	const activitySection = content.match(/\n## Activity summary\s*\n\n([\s\S]*?)(?=\n## (?:You|Agent)\s*\n\n|$)/);
	const activity = activitySection?.[1]?.split("\n").map((line) => line.replace(/^[-*]\s+/, "").trim()).filter(Boolean).slice(0, 24) ?? [];
	return {
		id,
		title: typeof frontmatterValue(content, "title") === "string" ? frontmatterValue(content, "title") : "Research chat",
		subject: typeof frontmatterValue(content, "subject") === "string" ? frontmatterValue(content, "subject") : frontmatterValue(content, "title"),
		updatedAt: typeof updated === "number" ? updated : Date.now(),
		messages,
		activity,
	};
}
