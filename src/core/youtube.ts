const YOUTUBE_URL = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s]*\bv=|shorts\/|live\/)|youtu\.be\/)[^\s<>()"']+/i;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

export function extractYoutubeUrl(text: string): string | null {
	const match = text.match(YOUTUBE_URL);
	if (!match) return null;
	const raw = match[0].replace(/[),.;!?]+$/g, "");
	try {
		const parsed = new URL(raw);
		const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
		const id = host === "youtu.be"
			? parsed.pathname.split("/").filter(Boolean)[0]
			: parsed.searchParams.get("v") ?? parsed.pathname.split("/").filter(Boolean)[1];
		if (!id || !VIDEO_ID.test(id)) return null;
		return `https://www.youtube.com/watch?v=${id}`;
	} catch {
		return null;
	}
}
