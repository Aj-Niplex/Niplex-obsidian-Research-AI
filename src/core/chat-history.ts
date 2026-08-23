import type { ChatMessage } from "./types";
import { boundText } from "./context-budget";

const MAX_SAVED_MESSAGES = 40;
const MAX_SAVED_MESSAGE_CHARS = 4000;

function visibleMessageContent(content: string): string {
	const injectedContextMarker = "\n\nSelected research mode:";
	const markerIndex = content.indexOf(injectedContextMarker);
	return (markerIndex >= 0 ? content.slice(0, markerIndex) : content).trim();
}

export function compactChatMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages
		.filter((message) => message.role === "user" || (message.role === "assistant" && !message.toolCalls?.length))
		.map((message) => ({
			role: message.role,
			content: boundText(visibleMessageContent(message.content), MAX_SAVED_MESSAGE_CHARS),
			...(message.videoUrl ? { videoUrl: message.videoUrl } : {}),
		}))
		.filter((message) => message.content.length > 0)
		.slice(-MAX_SAVED_MESSAGES);
}

export function searchableChatText(title: string, messages: ChatMessage[]): string {
	return [title, ...compactChatMessages(messages).map((message) => message.content)].join("\n").toLowerCase();
}
