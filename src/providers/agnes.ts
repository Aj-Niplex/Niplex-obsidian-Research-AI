import { requestUrl } from "obsidian";
import type { ProviderAdapter, ProviderRequest, ProviderResponse, ToolCall } from "../core/types";

const AGNES_URL = "https://apihub.agnes-ai.com/v1/chat/completions";

function parseArguments(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object") return value as Record<string, unknown>;
	if (typeof value !== "string") return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export class AgnesProvider implements ProviderAdapter {
	readonly id = "agnes" as const;

	constructor(private readonly apiKey: string) {}

	async complete(request: ProviderRequest): Promise<ProviderResponse> {
		if (!this.apiKey.trim()) throw new Error("Agnes API key is not configured.");
		const messages = request.messages.map((message) => {
			if (message.role === "assistant" && message.toolCalls?.length) {
				return {
					role: "assistant",
					content: message.content ?? null,
					tool_calls: message.toolCalls.map((call) => ({
						id: call.id,
						type: "function",
						function: { name: call.name, arguments: JSON.stringify(call.arguments) },
					})),
				};
			}
			if (message.role === "tool") {
					return { role: "tool", tool_call_id: message.toolCallId, content: message.content ?? "" };
			}
				return { role: message.role, content: message.content ?? "" };
		});
		const body = {
			model: request.model,
			messages,
			tools: request.tools.length
				? request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }))
				: undefined,
			tool_choice: request.tools.length ? "auto" : undefined,
		};
		const response = await requestUrl({
			url: AGNES_URL,
			method: "POST",
			contentType: "application/json",
			headers: { Authorization: `Bearer ${this.apiKey}` },
			body: JSON.stringify(body),
			throw: false,
		});
		const payload = response.json as {
			error?: { message?: string };
			choices?: Array<{
				finish_reason?: string;
				message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
			}>;
		};
		if (response.status >= 400) throw new Error(payload.error?.message ?? `Agnes request failed with HTTP ${response.status}.`);
		const choice = payload.choices?.[0];
		if (!choice?.message) throw new Error(`Agnes returned no usable response${choice?.finish_reason ? ` (${choice.finish_reason})` : ""}.`);
		const message = choice.message;
		const toolCalls: ToolCall[] = (message.tool_calls ?? [])
			.filter((call) => call.function?.name)
			.map((call, index) => ({
				id: call.id ?? `agnes-call-${Date.now()}-${index}`,
				name: call.function?.name ?? "",
				arguments: parseArguments(call.function?.arguments),
			}));
		return { text: message?.content?.trim() ?? "", toolCalls };
	}
}
