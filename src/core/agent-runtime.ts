import { providerErrorMessage } from "./provider-errors";
import { completeWithModelFallback } from "./model-fallback";
import type { AgentSettings, ChatMessage, ToolCall, ToolDefinition, ToolResult, ProviderAdapter } from "./types";
import { VaultContext } from "./vault-context";
import { protectHistory } from "./system-prompt";
import { boundHistoryMessages, boundText, CONTEXT_BUDGETS } from "./context-budget";
import { extractYoutubeUrl } from "./youtube";

export type AgentEventPhase = "thinking" | "tool" | "answer" | "error" | "complete";

export interface AgentEvent {
	type: "status" | "text" | "tool" | "error";
	message: string;
	step?: number;
	phase?: AgentEventPhase;
	final?: boolean;
	tool?: ToolCall;
	result?: ToolResult;
}

export interface AgentRunResult {
	text: string;
	messages: ChatMessage[];
	model: string;
	stopped?: boolean;
}

export type ApprovalHandler = (tool: ToolDefinition, call: ToolCall) => Promise<boolean>;

const MAX_TOOL_CALLS_PER_STEP = 1;
const MAX_CONTEXT_MESSAGES = 12;
function capText(text: string, maxChars: number): string {
	const limit = Math.max(1, maxChars);
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n…[tool result truncated by plugin]`;
}

function cloneMessage(message: ChatMessage): ChatMessage {
	return {
		...message,
		toolCalls: message.toolCalls?.map((call) => ({ ...call, arguments: { ...call.arguments } })),
	};
}

function trimHistory(messages: ChatMessage[]): void {
	while (messages.length > MAX_CONTEXT_MESSAGES) {
		const firstTurnIndex = messages.findIndex((message, index) => index >= 2 && message.role === "assistant");
		if (firstTurnIndex < 0) {
			messages.splice(2, 1);
			continue;
		}
		let removeCount = 1;
		while (messages[firstTurnIndex + removeCount]?.role === "tool") removeCount += 1;
		messages.splice(firstTurnIndex, removeCount);
	}
}

function messagesForProvider(messages: ChatMessage[]): ChatMessage[] {
	const system = messages.find((message) => message.role === "system");
	const withoutSystem = messages.filter((message) => message.role !== "system");
	const bounded = boundHistoryMessages(withoutSystem, Math.max(1, CONTEXT_BUDGETS.maxRequestMessageChars - (system?.content.length ?? 0)));
	return system ? [system, ...bounded] : bounded;
}

function safeError(error: unknown): string {
	return providerErrorMessage(error);
}

function configuredModel(settings: AgentSettings): string {
	return settings.provider === "gemini" ? settings.geminiModel : settings.agnesModel;
}

function configuredFallbackModels(settings: AgentSettings): string[] {
	return settings.provider === "gemini" ? settings.geminiFallbackModels : settings.agnesFallbackModels;
}

export class AgentRuntime {
	private readonly tools: ToolDefinition[];

	constructor(
		private readonly provider: ProviderAdapter,
		private readonly vaultContext: VaultContext,
		private readonly settings: AgentSettings,
		private readonly onDiagnostic?: (level: "info" | "warn" | "error", event: string, message: string, model?: string) => void,
	) {
		this.tools = vaultContext.getToolDefinitions();
	}

	async run(
		prompt: string,
		approve: ApprovalHandler,
		emit: (event: AgentEvent) => void,
		history: ChatMessage[] = [],
	): Promise<AgentRunResult> {
		const messages: ChatMessage[] = protectHistory(history.map(cloneMessage), this.settings.userSystemPrompt);
		const boundedPrompt = boundText(prompt.trim(), CONTEXT_BUDGETS.maxRequestMessageChars);
		const videoUrl = extractYoutubeUrl(boundedPrompt);
		messages.push({ role: "user", content: boundedPrompt, ...(videoUrl ? { videoUrl } : {}) });
		let lastText = "";
		let activeModel = configuredModel(this.settings);
		for (let iteration = 1; iteration <= this.settings.maxIterations; iteration += 1) {
			trimHistory(messages);
				emit({
					type: "status",
					phase: "thinking",
					step: iteration,
					message: iteration === 1 && videoUrl
						? this.provider.id === "gemini" ? `Public YouTube video detected. Sending one bounded video source to ${activeModel}.` : `Public YouTube video detected. ${this.provider.id} receives the link as text; switch to Gemini for direct video analysis.`
						: iteration === 1 ? `Sending bounded context to ${activeModel}. Fallback is active if this model is busy.` : `Reviewing the next bounded context with ${activeModel}…`,
					});
			let response;
			try {
				const completed = await completeWithModelFallback(
					this.provider,
							{ model: activeModel, messages: messagesForProvider(messages), tools: this.tools },
						{
							enabled: this.settings.autoFallbackOnRateLimit,
							configuredFallbackModels: configuredFallbackModels(this.settings),
							cooldowns: this.settings.modelCooldowns,
							onEvent: (event) => {
								if (event.type === "checking") emit({ type: "status", phase: "thinking", step: iteration, message: `${event.from} is unavailable or cooling down. Checking another available ${this.settings.provider} model…` });
								else if (event.type === "cooling_down") {
									const seconds = event.until ? Math.max(1, Math.ceil((event.until - Date.now()) / 1000)) : 60;
									const message = event.reason === "rate-limit" ? `Rate-limited: ${event.from} will be skipped for about ${seconds}s.` : event.reason === "timeout" ? `Timed out: ${event.from} will be skipped for about ${seconds}s.` : event.reason === "transient" ? `${event.from} is busy or at capacity; it will be skipped for about ${seconds}s.` : `Model ${event.from} is unavailable and will be skipped for about ${seconds}s.`;
									emit({ type: "status", phase: "thinking", step: iteration, message });
									this.onDiagnostic?.("warn", "model-cooldown", message, event.from);
								} else if (event.to) {
									const message = `Trying ${event.to} after ${event.from} was unavailable or slow.`;
									emit({ type: "status", phase: "thinking", step: iteration, message });
									this.onDiagnostic?.("info", "model-switch", message, event.to);
								}
							},
						},
				);
				activeModel = completed.model;
				response = completed.response;
			} catch (error) {
						const message = `Provider request failed on ${activeModel}: ${safeError(error)} Try the visible Retry action or switch models from Actions.`;
						emit({ type: "error", phase: "error", step: iteration, message });
					this.onDiagnostic?.("error", "provider-request-failed", message, activeModel);
					return { text: message, messages, model: activeModel };
			}

			const calls = response.toolCalls ?? [];
			if (response.text) {
				lastText = response.text;
				emit({
					type: "text",
					phase: calls.length === 0 ? "answer" : "thinking",
					step: iteration,
					final: calls.length === 0,
					message: response.text,
				});
			}
			if (calls.length === 0) {
				messages.push({ role: "assistant", content: response.text });
				emit({ type: "status", phase: "complete", step: iteration, message: "Finished." });
					return { text: lastText || "The provider returned no text.", messages, model: activeModel };
			}

			messages.push({ role: "assistant", content: response.text, toolCalls: calls });
			const [call] = calls.slice(0, MAX_TOOL_CALLS_PER_STEP);
			const skippedCalls = calls.slice(MAX_TOOL_CALLS_PER_STEP);
			for (const skippedCall of skippedCalls) {
				const skipped: ToolResult = {
					ok: false,
					isError: true,
					content: `Only one tool call is executed per step. Please plan sequentially and request ${skippedCall.name} on the following step.`,
				};
				messages.push({ role: "tool", content: skipped.content, toolCallId: skippedCall.id, toolName: skippedCall.name });
				emit({ type: "tool", phase: "tool", step: iteration, message: skipped.content, tool: skippedCall, result: skipped });
			}
			if (!call) continue;

			const definition = this.tools.find((tool) => tool.name === call.name);
			if (!definition) {
				const unknown: ToolResult = { ok: false, isError: true, content: `Tool is not available: ${call.name}` };
				messages.push({ role: "tool", content: unknown.content, toolCallId: call.id, toolName: call.name });
				emit({ type: "tool", phase: "tool", step: iteration, message: unknown.content, tool: call, result: unknown });
				continue;
			}
				if (!definition.readOnly && this.settings.researchMode !== "edit") {
					const denied: ToolResult = { ok: false, isError: true, content: `Write blocked in ${this.settings.researchMode} mode. Switch the mode selector to Create & edit before requesting a durable change.` };
					messages.push({ role: "tool", content: denied.content, toolCallId: call.id, toolName: call.name });
					emit({ type: "tool", phase: "tool", step: iteration, message: denied.content, tool: call, result: denied });
					continue;
				}
				if (!definition.readOnly && !(await approve(definition, call))) {
					const denied: ToolResult = { ok: false, isError: true, content: "User denied this write action." };
				messages.push({ role: "tool", content: denied.content, toolCallId: call.id, toolName: call.name });
				emit({ type: "tool", phase: "tool", step: iteration, message: denied.content, tool: call, result: denied });
				continue;
			}

			let result: ToolResult;
			try {
				result = await this.vaultContext.executeTool(call.name, call.arguments);
			} catch (error) {
				result = { ok: false, isError: true, content: `Tool failed: ${safeError(error)}` };
			}
			const bounded = { ...result, content: capText(result.content, this.settings.maxToolResultChars) };
			messages.push({ role: "tool", content: bounded.content, toolCallId: call.id, toolName: call.name });
			emit({ type: "tool", phase: "tool", step: iteration, message: bounded.content, tool: call, result: bounded });
		}
		const message = `Stopped after ${this.settings.maxIterations} agent steps. ${lastText || "Ask a follow-up question to continue."}`;
		emit({ type: "status", phase: "complete", message });
		return { text: message, messages, model: activeModel, stopped: true };
	}
}
