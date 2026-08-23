import assert from "node:assert/strict";
import test from "node:test";
import { canAutoApproveWrite, normalizeApprovalPolicy } from "../src/core/approval-policy";
import type { ToolCall, ToolDefinition } from "../src/core/types";

const createTool: ToolDefinition = { name: "create_file", description: "create", parameters: {}, readOnly: false };
const appendTool: ToolDefinition = { name: "append_file", description: "append", parameters: {}, readOnly: false };
const call = (path: string): ToolCall => ({ id: "1", name: "create_file", arguments: { path, content: "x" } });
const now = 1_700_000_000_000;

function timed(pathPrefix = "Research", tools: string[] = ["create_file"], expiresAt = now + 15 * 60 * 1000) {
	return normalizeApprovalPolicy({ mode: "timed", pathPrefix, tools, expiresAt }, now);
}

test("auto-approves only a selected tool below the configured path prefix", () => {
	const policy = timed();
	assert.equal(canAutoApproveWrite(policy, createTool, call("Research/note.md"), now), true);
	assert.equal(canAutoApproveWrite(policy, createTool, call("Researcher/note.md"), now), false);
	assert.equal(canAutoApproveWrite(policy, createTool, call("Other/note.md"), now), false);
	assert.equal(canAutoApproveWrite(policy, appendTool, call("Research/note.md"), now), false);
});

test("expired or malformed windows fall back to always ask", () => {
	assert.equal(normalizeApprovalPolicy({ mode: "timed", pathPrefix: "Research", tools: ["create_file"], expiresAt: now + 60_000 }, now).mode, "always");
	assert.equal(normalizeApprovalPolicy({ mode: "timed", pathPrefix: "../Research", tools: ["create_file"], expiresAt: now + 15 * 60 * 1000 }, now).mode, "always");
	assert.equal(canAutoApproveWrite(timed("Research", ["create_file"], now - 1), createTool, call("Research/note.md"), now), false);
});
