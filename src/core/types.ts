export type ProviderId = "gemini" | "agnes";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
	role: Role;
	content: string;
	toolCallId?: string;
	toolName?: string;
	toolCalls?: ToolCall[];
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	readOnly: boolean;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	thoughtSignature?: string;
}

export interface ProviderRequest {
	model: string;
	messages: ChatMessage[];
	tools: ToolDefinition[];
}

export interface ProviderResponse {
	text: string;
	toolCalls: ToolCall[];
}

export interface ProviderAdapter {
	readonly id: ProviderId;
	complete(request: ProviderRequest): Promise<ProviderResponse>;
}

export interface BoundedReadResult {
	path: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	hasMore: boolean;
	nextStartLine: number | null;
	content: string;
}

export interface SearchHit {
	path: string;
	line: number;
	snippet: string;
}

export interface ToolResult {
	ok: boolean;
	content: string;
	isError?: boolean;
}

export interface AgentSettings {
	provider: ProviderId;
	geminiModel: string;
	agnesModel: string;
	maxIterations: number;
	maxToolResultChars: number;
	maxReadLines: number;
	stateFolder: string;
}

export const DEFAULT_SETTINGS: AgentSettings = {
	provider: "gemini",
	geminiModel: "gemini-3.6-flash",
	agnesModel: "agnes-2.0-flash",
	maxIterations: 8,
	maxToolResultChars: 12000,
	maxReadLines: 160,
	stateFolder: ".obsidian-agentic-research",
};
