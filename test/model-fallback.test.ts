import assert from "node:assert/strict";
import test from "node:test";
import { ProviderRequestError } from "../src/core/provider-errors";
import { completeWithModelFallback } from "../src/core/model-fallback";
import type { ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse } from "../src/core/types";

const request: ProviderRequest = { model: "primary", messages: [], tools: [] };

class FakeProvider implements ProviderAdapter {
	readonly id = "gemini" as const;
	readonly attempted: string[] = [];
	constructor(private readonly responses: Record<string, Error | ProviderResponse>, private readonly models: ProviderModel[] = [
		{ id: "primary", label: "Primary" },
		{ id: "preferred-backup", label: "Preferred backup" },
		{ id: "catalogue-backup", label: "Catalogue backup" },
	]) {}
	async listModels() {
		return this.models;
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
	assert.deepEqual(events, ["cooling_down", "checking", "primary->preferred-backup"]);
});

test("does not fallback for authentication or malformed-request errors", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("invalid API key", 401) });
	await assert.rejects(
		completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: ["preferred-backup"] }),
		(error: unknown) => error instanceof ProviderRequestError && error.status === 401,
	);
	assert.deepEqual(provider.attempted, ["primary"]);
});

test("skips a rate-limited model across later calls and allows it after expiry", async () => {
	const cooldowns: Record<string, { until: number; reason: "rate-limit" | "unavailable" }> = {};
	const provider = new FakeProvider({ primary: new ProviderRequestError("quota exceeded", 429), "preferred-backup": { text: "recovered", toolCalls: [] } });
	const before = Date.now();
	await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: ["preferred-backup"], cooldowns });
	assert.ok((cooldowns["gemini/primary"]?.until ?? 0) - before >= 59_000);
	assert.ok((cooldowns["gemini/primary"]?.until ?? 0) - before <= 61_000);
	await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: ["preferred-backup"], cooldowns });
	assert.deepEqual(provider.attempted, ["primary", "preferred-backup", "preferred-backup"]);
	cooldowns["gemini/primary"] = { until: Date.now() - 1, reason: "rate-limit" };
	const reuseProvider = new FakeProvider({ primary: { text: "primary recovered", toolCalls: [] } });
	const reused = await completeWithModelFallback(reuseProvider, request, { enabled: true, configuredFallbackModels: [], cooldowns });
	assert.equal(reused.model, "primary");
	assert.deepEqual(reuseProvider.attempted, ["primary"]);
});

test("quarantines a stale model without treating it as a rate limit", async () => {
	const cooldowns: Record<string, { until: number; reason: "rate-limit" | "unavailable" }> = {};
	const provider = new FakeProvider({ primary: new ProviderRequestError("This model is no longer available", 400), "preferred-backup": { text: "recovered", toolCalls: [] } });
	const result = await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: ["preferred-backup"], cooldowns });
	assert.equal(result.model, "preferred-backup");
	assert.equal(cooldowns["gemini/primary"]?.reason, "unavailable");
});

test("prefers fast modern catalogue models over Gemma or older pro models", async () => {
	const provider = new FakeProvider(
		{ primary: new ProviderRequestError("quota exceeded", 429), "gemini-3.7-flash": { text: "fast recovery", toolCalls: [] }, "gemini-2.5-pro": { text: "old recovery", toolCalls: [] }, "gemma-4-26b-a4b-it": { text: "slow recovery", toolCalls: [] } },
		[
			{ id: "primary", label: "Primary" },
			{ id: "gemma-4-26b-a4b-it", label: "Gemma" },
			{ id: "gemini-2.5-pro", label: "Older Pro" },
			{ id: "gemini-3.7-flash", label: "Fast Flash" },
		],
	);
	const result = await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: [] });
	assert.equal(result.model, "gemini-3.7-flash");
	assert.deepEqual(provider.attempted, ["primary", "gemini-3.7-flash"]);
});

test("uses the live catalogue when no configured fallback order is provided", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("resource exhausted", 429), "preferred-backup": new ProviderRequestError("rate limit", 429), "catalogue-backup": { text: "second recovery", toolCalls: [] } });
	const result = await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: [] });
	assert.equal(result.model, "catalogue-backup");
	assert.deepEqual(provider.attempted, ["primary", "preferred-backup", "catalogue-backup"]);
});
