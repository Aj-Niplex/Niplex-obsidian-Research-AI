import assert from "node:assert/strict";
import test from "node:test";
import { compactChatMessages } from "../src/core/chat-history";
import { deriveChatSubject, splitGeneratedSubject } from "../src/core/chat-subject";

test("derives a readable subject locally without provider work", () => {
	assert.equal(deriveChatSubject("How can I organize my ADHD research notes?"), "Can Organize ADHD Research Notes");
	assert.equal(deriveChatSubject("https://youtu.be/abc123_XY9 give me a summary"), "Give Summary");
	assert.equal(deriveChatSubject("Hey what's up?"), "Chat");
	assert.equal(deriveChatSubject("Compare the latest study results", "Study Planning"), "Study Planning — Compare Latest Study Results");
	assert.equal(deriveChatSubject("Search porn videos"), "Chat");
});

test("removes the hidden generated subject marker from the visible answer", () => {
	assert.deepEqual(splitGeneratedSubject(`Answer text.
<chat_subject>Vault Research</chat_subject>`), { text: "Answer text.", subject: "Vault Research" });
	assert.deepEqual(splitGeneratedSubject("Answer without marker"), { text: "Answer without marker" });
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
