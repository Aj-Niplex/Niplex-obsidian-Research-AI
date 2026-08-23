const STOP_WORDS = new Set([
	"a", "an", "and", "are", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the", "this", "to", "want", "what", "with", "you",
]);

function titleCase(value: string): string {
	return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function deriveChatSubject(prompt: string): string {
	const withoutUrls = prompt.replace(/https?:\/\/\S+/gi, "");
	const words = withoutUrls
		.replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
		.split(/\s+/)
		.map((word) => word.trim().replace(/^['-]+|['-]+$/g, ""))
		.filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()));
	const candidate = words.slice(0, 8).join(" ").trim();
	if (!candidate) return "New research chat";
	const subject = titleCase(candidate);
	return subject.length > 56 ? `${subject.slice(0, 53).trimEnd()}…` : subject;
}
