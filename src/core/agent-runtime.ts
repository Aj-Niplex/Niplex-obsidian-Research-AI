import type { AgentSettings, ChatMessage, ToolCall, ToolDefinition, ToolResult, ProviderAdapter } from "./types";
import { VaultContext } from "./vault-context";

export interface AgentEvent {
	type: "status" | "text" | "tool" | "error";
	message: string;
	tool?: ToolCall;
	result?: ToolResult;
}

export type ApprovalHandler = (tool: ToolDefinition, call: ToolCall) => Promise<boolean>;

const MAX_TOOL_CALLS_PER_STEP = 1;
const MAX_CONTEXT_MESSAGES = 12;
const SYSTEM_PROMPT = `You are an agentic research assistant operating inside an Obsidian vault.
Use the vault tools to discover and inspect notes. Never ask for or assume the entire contents of a file in one request.
Start with list_files or search_vault, then use read_file_chunk with bounded line windows. Continue with nextStartLine only when necessary.
Execute at most one tool call per step; plan sequentially when more work is needed.
Return concise, evidence-based answers. When asked to conduct research, distinguish vault evidence from external knowledge and make the next action explicit.
Writing tools create durable changes and require approval; only use them when the user asks for a note or an append.`;

function capText(text: string, maxChars: number): string {
	const limit = Math.max(1, maxChars);
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n…[tool result truncated by plugin]`;
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

function safeError(error: unknown): string {
	return error instanceof Error ? error.message : "Unexpected agent error.";
}

export class AgentRuntime {
	private readonly tools: ToolDefinition[];

	constructor(
		private readonly provider: ProviderAdapter,
		private readonly vaultContext: VaultContext,
		private readonly settings: AgentSettings,
	) {
		this.tools = vaultContext.getToolDefinitions();
	}

	async run(prompt: string, approve: ApprovalHandler, emit: (event: AgentEvent) => void): Promise<string> {
		const messages: ChatMessage[] = [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: prompt.trim() },
		];
		let lastText = "";
		for (let iteration = 1; iteration <= this.settings.maxIterations; iteration += 1) {
			trimHistory(messages);
			emit({ type: "status", message: `Agent step ${iteration}/${this.settings.maxIterations}` });
			let response;
			try {
				response = await this.provider.complete({
					model: this.settings.provider === "gemini" ? this.settings.geminiModel : this.settings.agnesModel,
					messages,
					tools: this.tools,
				});
			} catch (error) {
				const message = `Provider request failed: ${safeError(error)}`;
				emit({ type: "error", message });
				return message;
			}

			if (response.text) {
				lastText = response.text;
				emit({ type: "text", message: response.text });
			}
			const calls = response.toolCalls ?? [];
			if (calls.length === 0) return lastText || "The provider returned no text.";

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
				emit({ type: "tool", message: skipped.content, tool: skippedCall, result: skipped });
			}
			if (!call) continue;

			const definition = this.tools.find((tool) => tool.name === call.name);
			if (!definition) {
				const unknown: ToolResult = { ok: false, isError: true, content: `Tool is not available: ${call.name}` };
				messages.push({ role: "tool", content: unknown.content, toolCallId: call.id, toolName: call.name });
				emit({ type: "tool", message: unknown.content, tool: call, result: unknown });
				continue;
			}
			if (!definition.readOnly && !(await approve(definition, call))) {
				const denied: ToolResult = { ok: false, isError: true, content: "User denied this write action." };
				messages.push({ role: "tool", content: denied.content, toolCallId: call.id, toolName: call.name });
				emit({ type: "tool", message: denied.content, tool: call, result: denied });
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
			emit({ type: "tool", message: bounded.content, tool: call, result: bounded });
		}
		const message = `Stopped after ${this.settings.maxIterations} agent steps. ${lastText || "Ask a follow-up question to continue."}`;
		emit({ type: "status", message });
		return message;
	}
}
