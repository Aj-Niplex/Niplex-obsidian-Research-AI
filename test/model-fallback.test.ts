import assert from "node:assert/strict";
import test from "node:test";
import { ProviderRequestError } from "../src/core/provider-errors";
import { completeWithModelFallback } from "../src/core/model-fallback";
import type { ModelCooldown, ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse } from "../src/core/types";

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

test("falls back when a provider reports temporary high demand", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("This model is currently experiencing high demand. Please try again later.", 503), "preferred-backup": { text: "recovered", toolCalls: [] } });
	const events: string[] = [];
	const result = await completeWithModelFallback(provider, request, {
		enabled: true,
		configuredFallbackModels: ["preferred-backup"],
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
	const cooldowns: Record<string, ModelCooldown> = {};
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
	const cooldowns: Record<string, ModelCooldown> = {};
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

test("uses the requested Gemini and Gemma fallback priority", async () => {
	const ordered = ["gemini-3.7-flash", "gemini-3.6-pro", "gemini-3.6-flash", "gemini-3.5-pro", "gemini-3.5-flash", "gemma-4-31b-it", "gemini-2.5-pro"];
	const responses: Record<string, Error | ProviderResponse> = { primary: new ProviderRequestError("quota exceeded", 429) };
	for (const model of ordered.slice(0, -1)) responses[model] = new ProviderRequestError("rate limit", 429);
	responses[ordered.at(-1)!] = { text: "top tier recovery", toolCalls: [] };
	const provider = new FakeProvider(responses, [{ id: "primary", label: "Primary" }, ...ordered.map((id) => ({ id, label: id }))]);
	const result = await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: [] });
	assert.equal(result.model, "gemini-2.5-pro");
	assert.deepEqual(provider.attempted, ["primary", ...ordered]);
});

test("stops an in-flight model attempt without starting fallback", async () => {
	const controller = new AbortController();
	const attempted: string[] = [];
	const provider: ProviderAdapter = {
		id: "gemini",
		async complete(next: ProviderRequest): Promise<ProviderResponse> {
			attempted.push(next.model);
			return await new Promise<ProviderResponse>(() => undefined);
		},
		async listModels(): Promise<ProviderModel[]> {
			return [{ id: "primary", label: "Primary" }, { id: "preferred-backup", label: "Preferred backup" }];
		},
	};
	const pending = completeWithModelFallback(provider, { ...request, signal: controller.signal }, { enabled: true, configuredFallbackModels: ["preferred-backup"] });
	controller.abort();
	await assert.rejects(pending, (error: unknown) => error instanceof ProviderRequestError && error.code === "run_stopped");
	assert.deepEqual(attempted, ["primary"]);
});

test("uses the live catalogue when no configured fallback order is provided", async () => {
	const provider = new FakeProvider({ primary: new ProviderRequestError("resource exhausted", 429), "preferred-backup": new ProviderRequestError("rate limit", 429), "catalogue-backup": { text: "second recovery", toolCalls: [] } });
	const result = await completeWithModelFallback(provider, request, { enabled: true, configuredFallbackModels: [] });
	assert.equal(result.model, "catalogue-backup");
	assert.deepEqual(provider.attempted, ["primary", "preferred-backup", "catalogue-backup"]);
});
