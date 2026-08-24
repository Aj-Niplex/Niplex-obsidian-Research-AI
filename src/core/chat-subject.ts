const STOP_WORDS = new Set([
	"a", "an", "and", "are", "as", "at", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the", "this", "to", "want", "what", "with", "you",
	"hey", "hi", "hello", "sup", "whats", "what's", "up", "yeah", "ok", "okay",
]);

const UNSUITABLE_SUBJECT_WORDS = new Set(["fuck", "fucking", "porn", "pornographic", "sex", "cheeks"]);

function titleCase(value: string): string {
	return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanSubject(value: string): string {
	return value.replace(/[\r\n#]+/g, " ").replace(/\s+/g, " ").trim();
}

function isMeaningfulSubject(value: string): boolean {
	const normalized = cleanSubject(value).toLowerCase();
	const words = normalized.split(/\s+/).filter(Boolean);
	return Boolean(words.length) && normalized !== "new research chat" && normalized !== "chat" && !words.some((word) => UNSUITABLE_SUBJECT_WORDS.has(word));
}

export function deriveChatSubject(prompt: string, previousSubject = ""): string {
	if ([...UNSUITABLE_SUBJECT_WORDS].some((word) => new RegExp(`\\b${word}\\b`, "i").test(prompt))) return "Chat";
	const withoutUrls = prompt.replace(/https?:\/\/\S+/gi, "");
	const words = withoutUrls
		.replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
		.split(/\s+/)
		.map((word) => word.trim().replace(/^['-]+|['-]+$/g, ""))
		.filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()) && !UNSUITABLE_SUBJECT_WORDS.has(word.toLowerCase()));
	const candidate = words.slice(0, 7).join(" ").trim();
	if (!candidate) return isMeaningfulSubject(previousSubject) ? cleanSubject(previousSubject) : "Chat";

	const current = titleCase(candidate);
	const prior = cleanSubject(previousSubject);
	const combined = isMeaningfulSubject(prior) && prior.toLowerCase() !== current.toLowerCase() ? `${prior} — ${current}` : current;
	return combined.length > 72 ? `${combined.slice(0, 69).trimEnd()}…` : combined;
}

export function normalizeGeneratedSubject(value: string): string {
	const subject = cleanSubject(value).replace(/^subject\s*:\s*/i, "");
	if (!subject || subject.length > 72 || subject.split(/\s+/).length > 10) return "";
	if (!isMeaningfulSubject(subject)) return "";
	return titleCase(subject);
}

export function splitGeneratedSubject(text: string): { text: string; subject?: string } {
	const match = text.match(/<chat_subject>\s*([^<\r\n]{1,100})\s*<\/chat_subject>/i);
	if (!match) return { text };
	const subject = normalizeGeneratedSubject(match[1] ?? "");
	const visibleText = text.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
	return subject ? { text: visibleText, subject } : { text: visibleText };
}
