import { DEFAULT_SETTINGS, type AgentSettings, type ModelCooldown, type MocCheckpoint, type MocCheckpointCategory, type OutputSize, type QuickActionId, type ResearchMode, type WindowSize } from "./types";
import { normalizeUserSystemPrompt } from "./system-prompt";
import { normalizeApprovalPolicy } from "./approval-policy";
import { emptyEcosystemGrant, type EcosystemPermissionGrant } from "./ecosystem";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeQuickActions(value: unknown): QuickActionId[] {
	const allowed: QuickActionId[] = ["history", "attach", "moc", "continue", "prompts", "logs"];
	const result = Array.isArray(value) ? value.filter((item): item is QuickActionId => typeof item === "string" && allowed.includes(item as QuickActionId)) : [];
	return [...new Set(result)].slice(0, 3).length ? [...new Set(result)].slice(0, 3) : [...DEFAULT_SETTINGS.quickActions];
}

function normalizeResearchMode(value: unknown): ResearchMode {
	return value === "plan" || value === "edit" ? value : "chat";
}

function normalizeOutputSize(value: unknown): OutputSize {
	return value === "lowest" || value === "low" || value === "high" || value === "maximum" ? value : "standard";
}

function normalizeWindowSize(value: unknown): WindowSize {
	return value === "compact" || value === "spacious" ? value : "comfortable";
}

function normalizeModelList(value: unknown): string[] {
	return Array.isArray(value) ? [...new Set(value.filter((model): model is string => typeof model === "string").map((model) => model.trim()).filter(Boolean))] : [];
}

function normalizeEcosystemPermissions(value: unknown): Record<string, EcosystemPermissionGrant> {
	if (!isRecord(value)) return {};
	const result: Record<string, EcosystemPermissionGrant> = {};
	for (const [extensionId, raw] of Object.entries(value)) {
		if (!isRecord(raw) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(extensionId)) continue;
		const defaults = emptyEcosystemGrant();
		result[extensionId] = {
			...defaults,
			boundedContext: raw.boundedContext === true,
			noteMetadata: raw.noteMetadata === true,
			mapProvenance: raw.mapProvenance === true,
			coarseActivity: raw.coarseActivity === true,
			skillGuidance: raw.skillGuidance === true,
			readOnlyActions: raw.readOnlyActions === true,
		};
	}
	return result;
}

function normalizeCooldowns(value: unknown): Record<string, ModelCooldown> {
	if (!isRecord(value)) return {};
	const result: Record<string, ModelCooldown> = {};
	for (const [key, raw] of Object.entries(value)) {
		if (!isRecord(raw) || typeof raw.until !== "number" || !Number.isFinite(raw.until) || raw.until <= Date.now()) continue;
		const reason = raw.reason === "unavailable" ? "unavailable" : raw.reason === "timeout" ? "timeout" : raw.reason === "transient" ? "transient" : raw.reason === "rate-limit" ? "rate-limit" : null;
		if (reason) result[key.slice(0, 180)] = { until: Math.min(raw.until, Date.now() + 10 * 60 * 1000), reason };
	}
	return result;
}

function normalizeCheckpoint(value: unknown): MocCheckpoint | undefined {
	if (!isRecord(value) || (value.mode !== "create" && value.mode !== "adjust") || typeof value.rootPath !== "string" || typeof value.onlyPath !== "string") return undefined;
	const categories: MocCheckpointCategory[] = Array.isArray(value.categories) ? value.categories.slice(0, 30).flatMap((item): MocCheckpointCategory[] => {
		if (!isRecord(item) || typeof item.name !== "string" || typeof item.description !== "string" || typeof item.reason !== "string" || !Array.isArray(item.notes)) return [];
		return [{ name: item.name.slice(0, 64), description: item.description.slice(0, 360), reason: item.reason.slice(0, 360), notes: item.notes.filter((note): note is string => typeof note === "string").slice(0, 5000) }];
	}) : [];
	const processedPaths = Array.isArray(value.processedPaths) ? value.processedPaths.filter((path): path is string => typeof path === "string").slice(0, 5000) : [];
	const errors = Array.isArray(value.errors) ? value.errors.filter((error): error is string => typeof error === "string").slice(-200).map((error) => error.slice(0, 240)) : [];
	return {
		mode: value.mode,
		rootPath: value.rootPath.trim().slice(0, 180),
		onlyPath: value.onlyPath.trim().slice(0, 180),
		processedPaths,
		categories,
		errors,
		updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? Math.min(value.updatedAt, Date.now()) : Date.now(),
	};
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
		mocTimeBudgetSeconds: numberValue("mocTimeBudgetSeconds", DEFAULT_SETTINGS.mocTimeBudgetSeconds, 30, 900),
		mocCheckpoint: normalizeCheckpoint(source.mocCheckpoint),
		stateFolder: typeof source.stateFolder === "string" && source.stateFolder.trim() ? source.stateFolder.trim() : DEFAULT_SETTINGS.stateFolder,
		mocFolder: typeof source.mocFolder === "string" && source.mocFolder.trim() ? source.mocFolder.trim().replace(/^\/+|\/+$/g, "") : DEFAULT_SETTINGS.mocFolder,
		mocLocationConfigured: source.mocLocationConfigured === true,
		activeMocPath: typeof source.activeMocPath === "string" ? source.activeMocPath.trim() : "",
		userSystemPrompt: normalizeUserSystemPrompt(source.userSystemPrompt),
		writeApprovalPolicy: normalizeApprovalPolicy(source.writeApprovalPolicy),
		quickActions: normalizeQuickActions(source.quickActions),
		researchMode: normalizeResearchMode(source.researchMode),
		outputSize: normalizeOutputSize(source.outputSize),
		windowSize: normalizeWindowSize(source.windowSize),
		onboardingVersion: numberValue("onboardingVersion", DEFAULT_SETTINGS.onboardingVersion, 0, 100),
		onboardingCompleted: source.onboardingCompleted === true || (typeof source.onboardingVersion === "number" && source.onboardingVersion > 0),
			ecosystemPermissions: normalizeEcosystemPermissions(source.ecosystemPermissions),
	};
}
