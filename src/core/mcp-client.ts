import { requestUrl } from "obsidian";
import { mcpResultToToolResult, type McpCallResult, type McpTool } from "./mcp-compat";
import type { ToolResult } from "./types";

interface JsonRpcResponse<T> {
	result?: T;
	error?: { code?: number; message?: string; data?: unknown };
}

function asObject(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export class McpClient {
	private nextId = 1;
	private sessionId: string | undefined;

	constructor(private readonly endpoint: string, private readonly headers: Record<string, string> = {}) {}

	private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
		const response = await requestUrl({
			url: this.endpoint,
			method: "POST",
			contentType: "application/json",
			headers: { Accept: "application/json, text/event-stream", ...this.headers, ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}) },
			body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
			throw: false,
		});
		const headers = response.headers as Record<string, string> | undefined;
		const session = headers?.["mcp-session-id"] ?? headers?.["Mcp-Session-Id"];
		if (session) this.sessionId = session;
		const payload = asObject(response.json) as JsonRpcResponse<T>;
		if (response.status >= 400 || payload.error) throw new Error(payload.error?.message || `MCP request failed with HTTP ${response.status}.`);
		if (payload.result === undefined) throw new Error("MCP response did not contain a result.");
		return payload.result;
	}

	async initialize(clientName = "Niplex Research AI", clientVersion = "0.1.23"): Promise<void> {
		await this.rpc("initialize", { protocolVersion: "2025-03-26", capabilities: { tools: {} }, clientInfo: { name: clientName, version: clientVersion } });
	}

	async listTools(): Promise<McpTool[]> {
		const result = await this.rpc<{ tools?: McpTool[] }>("tools/list");
		return (result.tools ?? []).filter((tool) => typeof tool?.name === "string").slice(0, 100);
	}

	async callTool(name: string, argumentsValue: Record<string, unknown> = {}): Promise<ToolResult> {
		const result = await this.rpc<McpCallResult>("tools/call", { name, arguments: argumentsValue });
		return mcpResultToToolResult(result);
	}
}
