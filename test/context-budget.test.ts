import assert from "node:assert/strict";
import { test } from "node:test";
import { boundHistoryMessages, boundInjectedContext, boundText, CONTEXT_BUDGETS } from "../src/core/context-budget";
import { normalizeUserSystemPrompt, SYSTEM_PROMPT_LIMITS } from "../src/core/system-prompt";

test("hard-bounds user prompt input", () => {
	const value = normalizeUserSystemPrompt("x".repeat(CONTEXT_BUDGETS.maxUserPromptChars + 500));
	assert.equal(value.length, SYSTEM_PROMPT_LIMITS.maxUserChars);
	assert.equal(SYSTEM_PROMPT_LIMITS.approximateTokenCeiling, 1500);
});

test("keeps injected context within one shared budget", () => {
	const value = boundInjectedContext(["question", "a".repeat(10000), "b".repeat(10000)], 1200);
	assert.ok(value.length <= 1200);
	assert.match(value, /^question/);
});

test("retains the newest history inside the character budget", () => {
	const value = boundHistoryMessages([
		{ role: "user", content: "old".repeat(300) },
		{ role: "assistant", content: "middle".repeat(300) },
		{ role: "user", content: "NEWEST-MESSAGE-" + "x".repeat(300) },
	], 500);
	assert.ok(value.length > 0);
	assert.ok(value[value.length - 1]?.content.startsWith("NEWEST-MESSAGE-"));
	assert.ok(value.reduce((sum, message) => sum + message.content.length, 0) <= 500);
	assert.ok(boundText("123456789", 5).length <= 5);
});
