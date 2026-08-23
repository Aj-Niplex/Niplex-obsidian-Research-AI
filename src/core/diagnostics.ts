import type { DiagnosticEntry, ProviderId } from "./types";

const MAX_ENTRIES = 200;
const MAX_MESSAGE_CHARS = 240;
const SECRET_PATTERN = /(api[-_ ]?key|authorization|x-goog-api-key)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const BEARER_PATTERN = /bearer\s+[^\s,;]+/gi;
const PATH_PATTERN = /(?:^|\s)(?:[A-Za-z0-9_.-]+\/)*[^\s]+\.md\b/g;

export function redactDiagnosticText(value: string): string {
	return value
		.replace(SECRET_PATTERN, "$1: [redacted]")
		.replace(BEARER_PATTERN, "Bearer [redacted]")
		.replace(PATH_PATTERN, " [vault-path redacted]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_MESSAGE_CHARS);
}

export function createDiagnosticEntry(
	level: DiagnosticEntry["level"],
	event: string,
	message: string,
	provider?: ProviderId,
	model?: string,
): DiagnosticEntry {
	return {
		at: Date.now(),
		level,
		event: event.slice(0, 80),
		provider,
		model: model ? redactDiagnosticText(model).slice(0, 120) : undefined,
		message: redactDiagnosticText(message),
	};
}

export class DiagnosticsStore {
	private entries: DiagnosticEntry[];

	constructor(initial: DiagnosticEntry[] = []) {
		this.entries = initial.filter((entry) => entry && typeof entry.message === "string").slice(-MAX_ENTRIES).map((entry) => ({
			...entry,
			model: entry.model ? redactDiagnosticText(entry.model).slice(0, 120) : undefined,
			message: redactDiagnosticText(entry.message),
		}));
	}

	record(entry: DiagnosticEntry): void {
		this.entries.push({ ...entry, model: entry.model ? redactDiagnosticText(entry.model).slice(0, 120) : undefined, message: redactDiagnosticText(entry.message) });
		if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
	}

	list(): DiagnosticEntry[] {
		return this.entries.map((entry) => ({ ...entry }));
	}

	clear(): void {
		this.entries = [];
	}

	formatForShare(): string {
		const lines = [
			"Niplex Research AI diagnostics",
			"These diagnostics intentionally exclude API keys, prompts, model responses, and vault excerpts.",
			"",
			...this.entries.map((entry) => {
				const timestamp = new Date(entry.at).toISOString();
				const provider = entry.provider ? ` ${entry.provider}${entry.model ? `/${entry.model}` : ""}` : "";
				return `[${timestamp}] ${entry.level.toUpperCase()} ${entry.event}${provider}: ${redactDiagnosticText(entry.message)}`;
			}),
		];
		return lines.join("\n");
	}
}
