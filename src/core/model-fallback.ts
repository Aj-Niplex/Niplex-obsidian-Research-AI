import { isModelUnavailableError, isRateLimitError, isTransientProviderError, ProviderRequestError } from "./provider-errors";
import type { ModelCooldown, ModelCooldownReason, ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse } from "./types";

export interface ModelFallbackOptions {
	enabled: boolean;
	configuredFallbackModels: string[];
	cooldowns?: Record<string, ModelCooldown>;
	cooldownMs?: number;
	unavailableCooldownMs?: number;
	requestTimeoutMs?: number;
	onEvent?: (event: {
		type: "checking" | "switching" | "cooling_down";
		from: string;
		to?: string;
		reason?: ModelCooldownReason;
		until?: number;
	}) => void;
}

export interface ModelFallbackResult {
	response: ProviderResponse;
	model: string;
}

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_UNAVAILABLE_COOLDOWN_MS = 10 * 60_000;

function uniqueModels(models: string[]): string[] {
	return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

function cooldownKey(provider: ProviderAdapter, model: string): string {
	return `${provider.id}/${model}`;
}

function activeCooldown(provider: ProviderAdapter, model: string, cooldowns: Record<string, ModelCooldown> | undefined): ModelCooldown | null {
	const value = cooldowns?.[cooldownKey(provider, model)];
	if (!value || value.until <= Date.now()) {
		if (value && cooldowns) delete cooldowns[cooldownKey(provider, model)];
		return null;
	}
	return value;
}

function rememberCooldown(
	provider: ProviderAdapter,
	model: string,
	reason: ModelCooldownReason,
	cooldowns: Record<string, ModelCooldown> | undefined,
	cooldownMs: number,
	unavailableCooldownMs: number,
): number {
	const until = Date.now() + (reason === "rate-limit" || reason === "timeout" || reason === "transient" ? cooldownMs : unavailableCooldownMs);
	if (cooldowns) cooldowns[cooldownKey(provider, model)] = { until, reason };
	return until;
}

function modelScore(provider: ProviderAdapter, model: string): number {
	const id = model.toLowerCase();
	let score = 100;
	if (provider.id === "gemini") {
		if (id.includes("flash")) score -= 35;
		if (id.includes("flash-lite")) score -= 8;
		if (id.includes("gemma")) score += 45;
		if (id.includes("pro")) score += 25;
		const version = id.match(/(?:gemini|gemma)[-_](\d+)(?:\.(\d+))?/);
		if (version) score -= Number(version[1] ?? 0) * 8 + Number(version[2] ?? 0);
	} else {
		if (id.includes("flash") || id.includes("mini") || id.includes("instant")) score -= 30;
		if (id.includes("pro")) score += 15;
	}
	return score;
}

function nextCandidate(
	provider: ProviderAdapter,
	attempted: Set<string>,
	configured: string[],
	catalogue: ProviderModel[],
	cooldowns: Record<string, ModelCooldown> | undefined,
): string | null {
	const available = new Set(catalogue.map((model) => model.id.trim()).filter(Boolean));
	const allCandidates = uniqueModels([...configured, ...catalogue.map((model) => model.id.trim())]).filter((model) => available.size === 0 || available.has(model));
	const candidates = allCandidates.filter((model) => !attempted.has(model) && !activeCooldown(provider, model, cooldowns));
	const ranked = candidates.sort((a, b) => modelScore(provider, a) - modelScore(provider, b));
	const fastChatModels = ranked.filter((model) => /(?:flash|mini|instant)/i.test(model));
	return (fastChatModels.length ? fastChatModels : ranked)[0] ?? null;
}

async function completeWithTimeout(provider: ProviderAdapter, request: ProviderRequest, timeoutMs: number): Promise<ProviderResponse> {
	let timeoutHandle: number | ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutHandle = typeof window === "undefined"
			? globalThis.setTimeout(() => reject(new ProviderRequestError(`Model request timed out after ${Math.round(timeoutMs / 1000)} seconds.`, 408, "request_timeout")), timeoutMs)
			: window.setTimeout(() => reject(new ProviderRequestError(`Model request timed out after ${Math.round(timeoutMs / 1000)} seconds.`, 408, "request_timeout")), timeoutMs);
	});
	try {
		return await Promise.race([provider.complete(request), timeout]);
	} finally {
		if (timeoutHandle !== undefined) {
			if (typeof timeoutHandle === "number") window.clearTimeout(timeoutHandle);
			else globalThis.clearTimeout(timeoutHandle);
		}
	}
}

async function loadCatalogue(provider: ProviderAdapter): Promise<ProviderModel[]> {
	try {
		return (await provider.listModels?.()) ?? [];
	} catch {
		return [];
	}
}

export async function completeWithModelFallback(
	provider: ProviderAdapter,
	request: ProviderRequest,
	options: ModelFallbackOptions,
): Promise<ModelFallbackResult> {
	const cooldowns = options.cooldowns;
	const cooldownMs = Math.max(1_000, options.cooldownMs ?? DEFAULT_COOLDOWN_MS);
	const unavailableCooldownMs = Math.max(cooldownMs, options.unavailableCooldownMs ?? DEFAULT_UNAVAILABLE_COOLDOWN_MS);
	const requestTimeoutMs = Math.max(5_000, options.requestTimeoutMs ?? 45_000);
	let activeModel = request.model;
	const attempted = new Set<string>();
	let catalogueChecked = false;
	let catalogue: ProviderModel[] = [];
	let lastFallbackError: unknown = null;

	while (true) {
		const blocked = activeCooldown(provider, activeModel, cooldowns);
		if (blocked) {
			if (!options.enabled) throw new ProviderRequestError(`Model ${activeModel} is cooling down. Automatic fallback is disabled.`, 429, "model_cooling_down");
			attempted.add(activeModel);
			options.onEvent?.({ type: "cooling_down", from: activeModel, reason: blocked.reason, until: blocked.until });
		} else {
			attempted.add(activeModel);
			try {
				return { response: await completeWithTimeout(provider, { ...request, model: activeModel }, requestTimeoutMs), model: activeModel };
				} catch (error) {
					const isTimeout = error instanceof ProviderRequestError && error.code === "request_timeout";
					const isTransient = isTransientProviderError(error);
					if (!options.enabled || (!isRateLimitError(error) && !isModelUnavailableError(error) && !isTimeout && !isTransient)) throw error;
				lastFallbackError = error;
				const reason: ModelCooldownReason = isRateLimitError(error) ? "rate-limit" : isTimeout ? "timeout" : isTransient ? "transient" : "unavailable";
				const until = rememberCooldown(provider, activeModel, reason, cooldowns, cooldownMs, unavailableCooldownMs);
				options.onEvent?.({ type: "cooling_down", from: activeModel, reason, until });
			}
		}

		options.onEvent?.({ type: "checking", from: activeModel });
		if (!catalogueChecked) {
			catalogueChecked = true;
			catalogue = await loadCatalogue(provider);
		}
		const nextModel = nextCandidate(provider, attempted, uniqueModels(options.configuredFallbackModels), catalogue, cooldowns);
		if (!nextModel) {
			if (lastFallbackError instanceof ProviderRequestError && lastFallbackError.code === "all_models_cooling_down") throw lastFallbackError;
			throw new ProviderRequestError("All available models for this provider are cooling down or unavailable. Try again shortly.", 429, "all_models_cooling_down");
		}
		options.onEvent?.({ type: "switching", from: activeModel, to: nextModel });
		activeModel = nextModel;
	}
}
