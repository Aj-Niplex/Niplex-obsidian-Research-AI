import assert from "node:assert/strict";
import test from "node:test";
import { ProviderRequestError } from "../src/core/provider-errors";
import { completeWithModelFallback } from "../src/core/model-fallback";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../src/core/types";

const request: ProviderRequest = { model: "primary", messages: [], tools: [] };

class FakeProvider implements ProviderAdapter {
	readonly id = "gemini" as const;
	readonly attempted: string[] = [];
	constructor(private readonly responses: Record<string, Error | ProviderResponse>) {}
	async listModels() {
		return [
			{ id: "primary", label: "Primary" },
			{ id: "preferred-backup", label: "Preferred backup" },
			{ id: "catalogue-backup", label: "Catalogue backup" },
		];
	}
	async complete(next: ProviderRequest): Promise<ProviderResponse> {
		this.attempted.push(next.model);
		const response = this.responses[next.model];
		if (response instanceof Error) throw response;
		return response ?? { text: `ok:${next.model}`, toolCalls: [] };
	}
}

test("tries configured same-provider fallback before the remaining live catalogue", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("quota exceeded", 429), "preferred-backup": { text: "recovered", toolCalls: [] } });
	const events: string[] = [];
	const result = await completeWithModelFallback(provider, request, {
		enabled: true,
		configuredFallbackModels: ["preferred-backup", "not-in-catalogue"],
		onEvent: (event) => events.push(event.type === "switching" ? `${event.from}->${event.to}` : event.type),
	});
	assert.equal(result.model, "preferred-backup");
	assert.deepEqual(provider.attempted, ["primary", "preferred-backup"]);
	assert.deepEqual(events, ["checking", "primary->preferred-backup"]);
});

test("does not fallback for authentication or malformed-request errors", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("invalid API key", 401) });
	await assert.rejects(
		completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: ["preferred-backup"] }),
		(error: unknown) => error instanceof ProviderRequestError && error.status === 401,
	);
	assert.deepEqual(provider.attempted, ["primary"]);
});

test("uses the live catalogue when no configured fallback order is provided", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("resource exhausted", 429), "preferred-backup": new ProviderRequestError("rate limit", 429), "catalogue-backup": { text: "second recovery", toolCalls: [] } });
	const result = await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: [] });
	assert.equal(result.model, "catalogue-backup");
	assert.deepEqual(provider.attempted, ["primary", "preferred-backup", "catalogue-backup"]);
});
