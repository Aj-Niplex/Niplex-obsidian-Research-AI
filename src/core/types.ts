export type ProviderId = "gemini" | "agnes";
export type ResearchMode = "plan" | "chat" | "edit";
export type QuickActionId = "history" | "attach" | "moc" | "continue" | "prompts" | "logs";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
	role: Role;
	content: string;
	toolCallId?: string;
	toolName?: string;
	toolCalls?: ToolCall[];
	videoUrl?: string;
}

export interface SavedChat {
	id: string;
	title: string;
	subject?: string;
	createdAt: number;
	updatedAt: number;
	provider: ProviderId;
	model: string;
	messages: ChatMessage[];
	attachments?: string[];
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

export interface ProviderModel {
	id: string;
	label: string;
}

export type ModelCooldownReason = "rate-limit" | "unavailable" | "timeout" | "transient";

export interface ModelCooldown {
	until: number;
	reason: ModelCooldownReason;
}

export interface DiagnosticEntry {
	at: number;
	level: "info" | "warn" | "error";
	event: string;
	provider?: ProviderId;
	model?: string;
	message: string;
}

export interface ProviderAdapter {
	readonly id: ProviderId;
	complete(request: ProviderRequest): Promise<ProviderResponse>;
	listModels?(): Promise<ProviderModel[]>;
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

export interface MocCheckpointCategory {
	name: string;
	description: string;
	reason: string;
	notes: string[];
}

export interface MocCheckpoint {
	mode: "create" | "adjust";
	rootPath: string;
	onlyPath: string;
	processedPaths: string[];
	categories: MocCheckpointCategory[];
	errors: string[];
	updatedAt: number;
}

export type WriteApprovalMode = "always" | "timed";

export interface WriteApprovalPolicy {
	mode: WriteApprovalMode;
	expiresAt: number;
	pathPrefix: string;
	tools: string[];
}

export interface AgentSettings {
	provider: ProviderId;
	geminiModel: string;
	agnesModel: string;
	geminiFallbackModels: string[];
	agnesFallbackModels: string[];
	autoFallbackOnRateLimit: boolean;
	modelCooldowns: Record<string, ModelCooldown>;
	maxIterations: number;
	maxToolResultChars: number;
	maxReadLines: number;
	mocTimeBudgetSeconds: number;
	mocCheckpoint?: MocCheckpoint;
	stateFolder: string;
	mocFolder: string;
	mocLocationConfigured: boolean;
	activeMocPath: string;
	userSystemPrompt: string;
	writeApprovalPolicy: WriteApprovalPolicy;
	quickActions: QuickActionId[];
	researchMode: ResearchMode;
	onboardingVersion: number;
}

export const DEFAULT_SETTINGS: AgentSettings = {
	provider: "gemini",
	geminiModel: "gemini-3.6-flash",
	agnesModel: "agnes-2.0-flash",
	geminiFallbackModels: [],
	agnesFallbackModels: [],
	autoFallbackOnRateLimit: true,
	modelCooldowns: {},
	maxIterations: 8,
	maxToolResultChars: 12000,
	maxReadLines: 160,
	mocTimeBudgetSeconds: 120,
	stateFolder: ".obsidian-agentic-research",
	mocFolder: "NIPLEX-OBSIDIAN/MOCs",
	mocLocationConfigured: false,
	activeMocPath: "",
	userSystemPrompt: "",
	writeApprovalPolicy: { mode: "always", expiresAt: 0, pathPrefix: "", tools: [] },
	quickActions: ["history", "moc", "prompts"],
	researchMode: "chat",
	onboardingVersion: 0,
};
