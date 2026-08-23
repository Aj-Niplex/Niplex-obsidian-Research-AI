import { requestUrl } from "obsidian";
import { ProviderRequestError } from "../core/provider-errors";
import type { ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse, ToolCall } from "../core/types";

const AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";
const AGNES_URL = `${AGNES_BASE_URL}/chat/completions`;

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

	async listModels(): Promise<ProviderModel[]> {
		if (!this.apiKey.trim()) throw new Error("Agnes API key is not configured.");
		const response = await requestUrl({
			url: `${AGNES_BASE_URL}/models`,
			method: "GET",
			headers: { Authorization: `Bearer ${this.apiKey}` },
			throw: false,
		});
		const payload = response.json as { data?: Array<{ id?: string; display_name?: string; displayName?: string }>; error?: { message?: string } };
		if (response.status >= 400) throw new ProviderRequestError(payload.error?.message ?? `Agnes model catalogue failed with HTTP ${response.status}.`, response.status, "agnes_http_error");
			return (payload.data ?? [])
				.map((model) => ({ id: model.id?.trim() ?? "", label: model.display_name?.trim() || model.displayName?.trim() || model.id?.trim() || "Agnes model" }))
				.filter((model) => Boolean(model.id) && !/(?:image|video|audio|tts|embedding)/i.test(model.id));
	}

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
		if (response.status >= 400) throw new ProviderRequestError(payload.error?.message ?? `Agnes request failed with HTTP ${response.status}.`, response.status, "agnes_http_error");
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
