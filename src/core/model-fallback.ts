import { isModelUnavailableError, isRateLimitError, ProviderRequestError } from "./provider-errors";
import type { ModelCooldown, ModelCooldownReason, ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse } from "./types";

export interface ModelFallbackOptions {
	enabled: boolean;
	configuredFallbackModels: string[];
	cooldowns?: Record<string, ModelCooldown>;
	cooldownMs?: number;
	unavailableCooldownMs?: number;
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
	const until = Date.now() + (reason === "rate-limit" ? cooldownMs : unavailableCooldownMs);
	if (cooldowns) cooldowns[cooldownKey(provider, model)] = { until, reason };
	return until;
}

function nextCandidate(
	provider: ProviderAdapter,
	attempted: Set<string>,
	configured: string[],
	catalogue: ProviderModel[],
	cooldowns: Record<string, ModelCooldown> | undefined,
): string | null {
	const available = new Set(catalogue.map((model) => model.id.trim()).filter(Boolean));
	const preferred = available.size > 0 ? configured.filter((model) => available.has(model)) : configured;
	const catalogueModels = catalogue.map((model) => model.id.trim()).filter(Boolean);
	return [...preferred, ...catalogueModels].find((model) => !attempted.has(model) && !activeCooldown(provider, model, cooldowns)) ?? null;
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
				return { response: await provider.complete({ ...request, model: activeModel }), model: activeModel };
			} catch (error) {
				if (!options.enabled || (!isRateLimitError(error) && !isModelUnavailableError(error))) throw error;
				lastFallbackError = error;
				const reason: ModelCooldownReason = isRateLimitError(error) ? "rate-limit" : "unavailable";
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
