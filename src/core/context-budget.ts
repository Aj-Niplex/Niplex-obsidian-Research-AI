export const CONTEXT_BUDGETS = {
	maxUserPromptChars: 6000,
	maxSkillGuidanceChars: 6000,
	maxSuperMocChars: 6000,
	maxAttachmentChars: 8000,
	maxInjectedContextChars: 20000,
	maxHistoryChars: 10000,
	maxRequestMessageChars: 32000,
} as const;

export function boundText(value: string, maxChars: number, suffix = "\n…[context truncated by plugin]"): string {
	const limit = Math.max(1, Math.floor(maxChars));
	if (value.length <= limit) return value;
	if (limit <= suffix.length) return suffix.slice(0, limit);
	const visible = limit - suffix.length;
	return `${value.slice(0, visible)}${suffix}`;
}

export function boundInjectedContext(parts: string[], maxChars: number = CONTEXT_BUDGETS.maxInjectedContextChars): string {
	const output: string[] = [];
	let remaining = Math.max(1, Math.floor(maxChars));
	for (const part of parts) {
		if (remaining <= 0) break;
		const separator = output.length ? "\n\n" : "";
		const allowance = Math.max(1, remaining - separator.length);
		const bounded = boundText(part, allowance);
		output.push(`${separator}${bounded}`);
		remaining -= separator.length + bounded.length;
		if (bounded !== part) break;
	}
	return output.join("");
}

export function boundHistoryMessages<T extends { role: string; content: string }>(messages: T[], maxChars: number = CONTEXT_BUDGETS.maxHistoryChars): T[] {
	let remaining = Math.max(1, Math.floor(maxChars));
	const kept: T[] = [];
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (!message) continue;
		if (remaining <= 0) break;
		const content = boundText(message.content, remaining);
		kept.push({ ...message, content });
		remaining -= content.length;
	}
	return kept.reverse();
}
