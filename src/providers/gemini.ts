import { requestUrl } from "obsidian";
import { ProviderRequestError } from "../core/provider-errors";
import type { ChatMessage, ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse, ToolCall } from "../core/types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function errorMessage(payload: unknown, status: number): string {
	if (payload && typeof payload === "object" && "error" in payload) {
		const error = (payload as { error?: { message?: string } }).error;
		if (error?.message) return error.message;
	}
	return `Gemini request failed with HTTP ${status}.`;
}

function toGeminiContents(messages: ChatMessage[]): { contents: unknown[]; systemInstruction?: unknown } {
	const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
	const contents = messages
		.filter((message) => message.role !== "system")
		.map((message) => {
			if (message.role === "tool") {
				return {
					role: "user",
					parts: [
						{
							functionResponse: {
								name: message.toolName ?? "tool",
								response: { content: message.content },
								id: message.toolCallId,
							},
						},
					],
				};
			}
			const parts: unknown[] = [];
			if (message.content) parts.push({ text: message.content });
			for (const call of message.toolCalls ?? []) {
				parts.push({
					functionCall: { name: call.name, args: call.arguments, id: call.id },
					...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
				});
			}
			return { role: message.role === "assistant" ? "model" : "user", parts };
		});
	return {
		contents,
		systemInstruction: system ? { parts: [{ text: system }] } : undefined,
	};
}

export class GeminiProvider implements ProviderAdapter {
	readonly id = "gemini" as const;

	constructor(private readonly apiKey: string) {}

	async listModels(): Promise<ProviderModel[]> {
		if (!this.apiKey.trim()) throw new Error("Gemini API key is not configured.");
		const response = await requestUrl({
			url: "https://generativelanguage.googleapis.com/v1beta/models",
			method: "GET",
			headers: { "x-goog-api-key": this.apiKey },
			throw: false,
		});
		const payload = response.json as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
		if (response.status >= 400) throw new ProviderRequestError(errorMessage(payload, response.status), response.status, "gemini_http_error");
		return (payload.models ?? [])
			.filter((model) => model.name?.startsWith("models/") && model.supportedGenerationMethods?.includes("generateContent"))
			.map((model) => ({ id: model.name?.replace(/^models\//, "") ?? "", label: model.displayName?.trim() || model.name?.replace(/^models\//, "") || "Gemini model" }))
			.filter((model) => Boolean(model.id));
	}

	async complete(request: ProviderRequest): Promise<ProviderResponse> {
		if (!this.apiKey.trim()) throw new Error("Gemini API key is not configured.");
		const mapped = toGeminiContents(request.messages);
		const body = {
			contents: mapped.contents,
			systemInstruction: mapped.systemInstruction,
			tools: request.tools.length
				? [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }]
				: undefined,
			generationConfig: { temperature: 0.2 },
		};
		const response = await requestUrl({
			url: `${GEMINI_BASE_URL}/${encodeURIComponent(request.model)}:generateContent`,
			method: "POST",
			contentType: "application/json",
			headers: { "x-goog-api-key": this.apiKey },
			body: JSON.stringify(body),
			throw: false,
		});
					const payload = response.json as {
				candidates?: Array<{
					finishReason?: string;
					finishMessage?: string;
					content?: {
						parts?: Array<{
							text?: string;
							functionCall?: { name?: string; args?: Record<string, unknown>; id?: string };
							thoughtSignature?: string;
						}>;
					};
				}>;
			};

			if (response.status >= 400) throw new ProviderRequestError(errorMessage(payload, response.status), response.status, "gemini_http_error");
			const candidate = payload.candidates?.[0];
			if (!candidate) throw new ProviderRequestError("Gemini returned no candidates; check the model name, safety settings, or API key.", response.status, "gemini_no_candidate");
			const parts = candidate.content?.parts ?? [];
		const toolCalls: ToolCall[] = [];
		const text = parts
			.map((part, index) => {
				if (!part.functionCall?.name) return part.text ?? "";
				toolCalls.push({
					id: part.functionCall.id ?? `gemini-call-${Date.now()}-${index}`,
					name: part.functionCall.name,
									arguments: part.functionCall.args ?? {},
									thoughtSignature: part.thoughtSignature,
								});
				return "";
			})
			.join("")
			.trim();
		return { text, toolCalls };
	}
}
