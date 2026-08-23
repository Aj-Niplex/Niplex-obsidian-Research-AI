import assert from "node:assert/strict";
import test from "node:test";
import { compactChatMessages } from "../src/core/chat-history";
import { deriveChatSubject } from "../src/core/chat-subject";

test("derives a readable subject locally without provider work", () => {
	assert.equal(deriveChatSubject("How can I organize my ADHD research notes?"), "Can Organize ADHD Research Notes");
	assert.equal(deriveChatSubject("https://youtu.be/abc123_XY9 give me a summary"), "Give Summary");
});

test("compacts saved history to user and final assistant messages", () => {
	const messages = compactChatMessages([
		{ role: "user", content: "Question" },
		{ role: "assistant", content: "Planning", toolCalls: [{ id: "1", name: "search_vault", arguments: {} }] },
		{ role: "tool", content: "Large internal result", toolName: "search_vault" },
		{ role: "assistant", content: "Final answer" },
	]);
	assert.deepEqual(messages.map((message) => message.content), ["Question", "Final answer"]);
});
