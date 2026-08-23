import { DEFAULT_SETTINGS, type AgentSettings, type ModelCooldown } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeModelList(value: unknown): string[] {
	return Array.isArray(value) ? [...new Set(value.filter((model): model is string => typeof model === "string").map((model) => model.trim()).filter(Boolean))] : [];
}

function normalizeCooldowns(value: unknown): Record<string, ModelCooldown> {
	if (!isRecord(value)) return {};
	const result: Record<string, ModelCooldown> = {};
	for (const [key, raw] of Object.entries(value)) {
		if (!isRecord(raw) || typeof raw.until !== "number" || !Number.isFinite(raw.until) || raw.until <= Date.now()) continue;
		const reason = raw.reason === "unavailable" ? "unavailable" : raw.reason === "rate-limit" ? "rate-limit" : null;
		if (reason) result[key.slice(0, 180)] = { until: Math.min(raw.until, Date.now() + 10 * 60 * 1000), reason };
	}
	return result;
}

export function normalizeAgentSettings(value: unknown): AgentSettings {
	const source = isRecord(value) ? value : {};
	const numberValue = (key: string, fallback: number, min: number, max: number): number => {
		const value = source[key];
		return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), min), max) : fallback;
	};
	return {
		...DEFAULT_SETTINGS,
		provider: source.provider === "agnes" ? "agnes" : "gemini",
		geminiModel: typeof source.geminiModel === "string" && source.geminiModel.trim() ? source.geminiModel.trim() : DEFAULT_SETTINGS.geminiModel,
		agnesModel: typeof source.agnesModel === "string" && source.agnesModel.trim() ? source.agnesModel.trim() : DEFAULT_SETTINGS.agnesModel,
		geminiFallbackModels: normalizeModelList(source.geminiFallbackModels),
		agnesFallbackModels: normalizeModelList(source.agnesFallbackModels),
		autoFallbackOnRateLimit: source.autoFallbackOnRateLimit !== false,
		modelCooldowns: normalizeCooldowns(source.modelCooldowns),
		maxIterations: numberValue("maxIterations", DEFAULT_SETTINGS.maxIterations, 1, 30),
		maxToolResultChars: numberValue("maxToolResultChars", DEFAULT_SETTINGS.maxToolResultChars, 1000, 50000),
		maxReadLines: numberValue("maxReadLines", DEFAULT_SETTINGS.maxReadLines, 20, 500),
		stateFolder: typeof source.stateFolder === "string" && source.stateFolder.trim() ? source.stateFolder.trim() : DEFAULT_SETTINGS.stateFolder,
		activeMocPath: typeof source.activeMocPath === "string" ? source.activeMocPath.trim() : "",
		onboardingVersion: numberValue("onboardingVersion", DEFAULT_SETTINGS.onboardingVersion, 0, 100),
	};
}
