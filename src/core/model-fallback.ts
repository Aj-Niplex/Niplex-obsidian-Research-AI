import { isRateLimitError } from "./provider-errors";
import type { ProviderAdapter, ProviderModel, ProviderRequest, ProviderResponse } from "./types";

export interface ModelFallbackOptions {
	enabled: boolean;
	configuredFallbackModels: string[];
	onEvent?: (event: { type: "checking" | "switching"; from: string; to?: string }) => void;
}

export interface ModelFallbackResult {
	response: ProviderResponse;
	model: string;
}

function uniqueModels(models: string[]): string[] {
	return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

export async function completeWithModelFallback(
	provider: ProviderAdapter,
	request: ProviderRequest,
	options: ModelFallbackOptions,
): Promise<ModelFallbackResult> {
	let activeModel = request.model;
	const attempted = new Set<string>([activeModel]);
	let catalogueChecked = false;
	let catalogue: ProviderModel[] = [];

	while (true) {
		try {
			return { response: await provider.complete({ ...request, model: activeModel }), model: activeModel };
		} catch (error) {
			if (!options.enabled || !isRateLimitError(error)) throw error;
			options.onEvent?.({ type: "checking", from: activeModel });
			if (!catalogueChecked) {
				catalogueChecked = true;
				try {
					catalogue = (await provider.listModels?.()) ?? [];
				} catch {
					catalogue = [];
				}
			}
			const available = new Set(catalogue.map((model) => model.id.trim()).filter(Boolean));
			const configured = uniqueModels(options.configuredFallbackModels);
			const preferred = available.size > 0 ? configured.filter((model) => available.has(model)) : configured;
			const catalogueModels = catalogue.map((model) => model.id.trim()).filter(Boolean);
			const nextModel = [...preferred, ...catalogueModels].find((model) => !attempted.has(model));
			if (!nextModel) throw error;
			attempted.add(nextModel);
			options.onEvent?.({ type: "switching", from: activeModel, to: nextModel });
			activeModel = nextModel;
		}
	}
}
