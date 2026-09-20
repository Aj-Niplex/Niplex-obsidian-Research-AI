import type { ToolDefinition, ToolResult } from "./types";

export interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface McpCallResult {
	content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
	structuredContent?: unknown;
	isError?: boolean;
}

export function mcpToolToDefinition(tool: McpTool): ToolDefinition {
	return {
		name: tool.name,
		description: tool.description?.trim() || `MCP tool ${tool.name}`,
		parameters: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} },
		readOnly: false,
	};
}

export function mcpResultToToolResult(result: McpCallResult): ToolResult {
	const parts = (result.content ?? [])
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text as string);
	const content = parts.length ? parts.join("\n") : result.structuredContent === undefined ? "MCP tool returned no textual content." : JSON.stringify(result.structuredContent);
	return { ok: result.isError !== true, isError: result.isError === true, content };
}
