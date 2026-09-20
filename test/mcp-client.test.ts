import assert from "node:assert/strict";
import test from "node:test";
import { mcpResultToToolResult, mcpToolToDefinition } from "../src/core/mcp-compat";

test("maps MCP tools to the plugin's normalized tool contract", () => {
	const definition = mcpToolToDefinition({ name: "lookup", description: "Look something up", inputSchema: { type: "object", properties: { q: { type: "string" } } } });
	assert.equal(definition.name, "lookup");
	assert.equal(definition.readOnly, false);
	assert.deepEqual(definition.parameters, { type: "object", properties: { q: { type: "string" } } });
});

test("maps MCP text and structured results to bounded tool results", () => {
	assert.deepEqual(mcpResultToToolResult({ content: [{ type: "text", text: "done" }] }), { ok: true, isError: false, content: "done" });
	assert.equal(mcpResultToToolResult({ isError: true, structuredContent: { code: "bad" } }).ok, false);
	assert.match(mcpResultToToolResult({ structuredContent: { code: "bad" } }).content, /bad/);
});
