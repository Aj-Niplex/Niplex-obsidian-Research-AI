import type { AgentSettings, ChatMessage, ToolCall, ToolDefinition, ToolResult, ProviderAdapter } from "./types";
import { VaultContext } from "./vault-context";

export interface AgentEvent {
	type: "status" | "text" | "tool" | "error";
	message: string;
	tool?: ToolCall;
	result?: ToolResult;
}

export type ApprovalHandler = (tool: ToolDefinition, call: ToolCall) => Promise<boolean>;

const SYSTEM_PROMPT = `You are an agentic research assistant operating inside an Obsidian vault.
Use the vault tools to discover and inspect notes. Never ask for or assume the entire contents of a file in one request.
Start with list_files or search_vault, then use read_file_chunk with bounded line windows. Continue with nextStartLine only when necessary.
Return concise, evidence-based answers. When asked to conduct research, distinguish vault evidence from external knowledge and make the next action explicit.
Writing tools create durable changes and require approval; only use them when the user asks for a note or an append.`;

function capText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n…[tool result truncated by plugin]`;
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
			emit({ type: "status", message: `Agent step ${iteration}/${this.settings.maxIterations}` });
			const response = await this.provider.complete({
				model: this.settings.provider === "gemini" ? this.settings.geminiModel : this.settings.agnesModel,
				messages,
				tools: this.tools,
			});
			if (response.text) {
				lastText = response.text;
				emit({ type: "text", message: response.text });
			}
			if (response.toolCalls.length === 0) return lastText || "The provider returned no text.";

			messages.push({ role: "assistant", content: response.text, toolCalls: response.toolCalls });
			for (const call of response.toolCalls) {
				const definition = this.tools.find((tool) => tool.name === call.name);
				if (!definition) {
					const unknown: ToolResult = { ok: false, isError: true, content: `Tool is not available: ${call.name}` };
					messages.push({ role: "tool", content: capText(unknown.content, this.settings.maxToolResultChars), toolCallId: call.id, toolName: call.name });
					emit({ type: "tool", message: unknown.content, tool: call, result: unknown });
					continue;
				}
				if (!definition.readOnly) {
					const allowed = await approve(definition, call);
					if (!allowed) {
						const denied: ToolResult = { ok: false, isError: true, content: "User denied this write action." };
						messages.push({ role: "tool", content: denied.content, toolCallId: call.id, toolName: call.name });
						emit({ type: "tool", message: denied.content, tool: call, result: denied });
						continue;
					}
				}
				const result = await this.vaultContext.executeTool(call.name, call.arguments);
				const bounded = { ...result, content: capText(result.content, this.settings.maxToolResultChars) };
				messages.push({ role: "tool", content: bounded.content, toolCallId: call.id, toolName: call.name });
				emit({ type: "tool", message: bounded.content, tool: call, result: bounded });
			}
		}
		const message = `Stopped after ${this.settings.maxIterations} agent steps. ${lastText || "Ask a follow-up question to continue."}`;
		emit({ type: "status", message });
		return message;
	}
}
