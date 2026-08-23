import { completeWithModelFallback } from "./model-fallback";
import type { ModelCooldown, ProviderAdapter, ProviderRequest, ToolResult } from "./types";
import type { NoteForCategorization, VaultContext } from "./vault-context";

export interface MocCategory {
	name: string;
	description: string;
	reason: string;
	notes: Set<string>;
}

export interface MocProgress {
	phase: "reading" | "classifying" | "writing" | "complete" | "error";
	current: number;
	total: number;
	path?: string;
	message: string;
}

export interface MocBuildResult extends ToolResult {
	notesProcessed: number;
	categories: number;
	rootPath: string;
	superPath: string;
}

interface ModelCategory {
	name?: unknown;
	description?: unknown;
	reason?: unknown;
}

interface ModelCombination {
	categories?: unknown;
	reason?: unknown;
}

const MAX_CATEGORIES = 30;
const MAX_CATEGORY_NAME_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 360;

function asText(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeCategoryName(value: unknown): string {
	return asText(value, "Uncategorized")
		.replace(/[\\/:*?"<>|#[\]^]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_CATEGORY_NAME_CHARS) || "Uncategorized";
}

function categoryKey(name: string): string {
	return name.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function trimText(value: unknown, fallback: string, maxChars: number): string {
	return asText(value, fallback).slice(0, maxChars);
}

function noteLink(path: string): string {
	return `[[${path.replace(/\.md$/i, "")}]]`;
}

function extractJson(text: string): unknown {
	const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
	const start = unfenced.indexOf("{");
	const end = unfenced.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
	} catch {
		return null;
	}
}

function parseCategories(text: string): ModelCategory[] {
	const parsed = extractJson(text);
	if (!parsed || typeof parsed !== "object" || !("categories" in parsed)) return [];
	const categories = (parsed as { categories?: unknown }).categories;
	return Array.isArray(categories) ? categories.filter((item): item is ModelCategory => Boolean(item) && typeof item === "object").slice(0, 6) : [];
}

function parseCombinations(text: string): ModelCombination[] {
	const parsed = extractJson(text);
	if (!parsed || typeof parsed !== "object" || !("combinations" in parsed)) return [];
	const combinations = (parsed as { combinations?: unknown }).combinations;
	return Array.isArray(combinations) ? combinations.filter((item): item is ModelCombination => Boolean(item) && typeof item === "object").slice(0, 8) : [];
}

function normalizeRoot(value: string): string {
	return value.replace(/^\/+|\/+$/g, "").trim() || "MOCs";
}

function categoryFilePath(root: string, name: string): string {
	const fileName = safeCategoryName(name) === "MOCs super" ? "Category index" : safeCategoryName(name);
	return `${root}/${fileName}.md`;
}

function categoryDescription(category: MocCategory): string {
	return category.description || `Notes connected by the signals: ${category.reason || "shared properties and bounded content"}.`;
}

export class MocOrganizer {
	constructor(
		private readonly provider: ProviderAdapter,
		private model: string,
		private readonly vault: VaultContext,
		private readonly fallbackModels: string[] = [],
		private readonly autoFallback = true,
		private readonly cooldowns: Record<string, ModelCooldown> = {},
		private readonly onDiagnostic?: (level: "info" | "warn" | "error", event: string, message: string, model?: string) => void,
	) {}

	async build(
		mode: "create" | "adjust",
		rootInput: string,
		maxNotes: number,
		onProgress: (progress: MocProgress) => void,
		onlyPath = "",
	): Promise<MocBuildResult> {
		const root = normalizeRoot(rootInput);
		const superPath = `${root}/MOCs super.md`;
		const excludedPrefix = `${root}/`;
			const notes = await this.vault.getNotesForCategorization(mode === "adjust" ? 1 : Math.max(Math.floor(maxNotes), 0), onlyPath, excludedPrefix);
		if (notes.length === 0) {
			return { ok: false, isError: true, content: "No eligible Markdown notes were found for this incremental run.", notesProcessed: 0, categories: 0, rootPath: root, superPath };
		}

		const categories = new Map<string, MocCategory>();
		if (mode === "adjust") await this.loadExistingCategories(root, categories);
		const errors: string[] = [];
		for (let index = 0; index < notes.length; index += 1) {
			const note = notes[index];
			if (!note) continue;
			onProgress({ phase: "reading", current: index + 1, total: notes.length, path: note.path, message: `Reading bounded metadata and excerpt from ${note.path}` });
			onProgress({ phase: "classifying", current: index + 1, total: notes.length, path: note.path, message: `Asking ${this.model} to find categories for this note` });
			try {
				if (mode === "adjust") {
					for (const category of categories.values()) category.notes.delete(note.path);
				}
					const result = await this.classify(note, onProgress, index + 1, notes.length);
				const parsed = parseCategories(result);
				const usable = parsed.length ? parsed : [{ name: "Uncategorized", description: "Notes that need more signals before a more specific category can be chosen.", reason: "The model did not return a usable category." }];
				for (const item of usable) {
					const name = safeCategoryName(item.name);
					if (categoryKey(name) === categoryKey("MOCs super")) continue;
					const key = categoryKey(name);
					if (!categories.has(key) && categories.size >= MAX_CATEGORIES) continue;
					const current = categories.get(key) ?? {
						name,
						description: trimText(item.description, "A model-discovered group of related notes.", MAX_DESCRIPTION_CHARS),
						reason: trimText(item.reason, "Shared properties or bounded-content signals.", MAX_DESCRIPTION_CHARS),
						notes: new Set<string>(),
					};
					if (!current.description && item.description) current.description = trimText(item.description, current.description, MAX_DESCRIPTION_CHARS);
					if (!current.reason && item.reason) current.reason = trimText(item.reason, current.reason, MAX_DESCRIPTION_CHARS);
					current.notes.add(note.path);
					categories.set(key, current);
				}
			} catch (error) {
				errors.push(`${note.path}: ${error instanceof Error ? error.message : "classification failed"}`);
				onProgress({ phase: "error", current: index + 1, total: notes.length, path: note.path, message: `Could not classify ${note.path}; it will be retried later.` });
			}
		}

		if (categories.size === 0) {
			return { ok: false, isError: true, content: errors.join("\n") || "The model returned no usable categories.", notesProcessed: notes.length, categories: 0, rootPath: root, superPath };
		}

		const ordered = [...categories.values()].sort((a, b) => a.name.localeCompare(b.name));
		onProgress({ phase: "classifying", current: notes.length, total: notes.length, message: `Asking ${this.model} to recommend useful category combinations` });
			const recommendations = await this.recommendCombinations(ordered, onProgress, notes.length);
		onProgress({ phase: "writing", current: 0, total: ordered.length + 1, message: "Writing category MOCs and the super-MOC" });
		for (let index = 0; index < ordered.length; index += 1) {
			const category = ordered[index];
			if (!category) continue;
			const result = await this.vault.writeGeneratedNote(categoryFilePath(root, category.name), this.renderCategory(category), mode === "adjust");
			if (!result.ok) return { ok: false, isError: true, content: result.content, notesProcessed: notes.length, categories: ordered.length, rootPath: root, superPath };
			onProgress({ phase: "writing", current: index + 1, total: ordered.length + 1, path: categoryFilePath(root, category.name), message: `Updated ${category.name}` });
		}
		const superResult = await this.vault.writeGeneratedNote(superPath, this.renderSuper(root, ordered, recommendations), mode === "adjust");
		if (!superResult.ok) return { ok: false, isError: true, content: superResult.content, notesProcessed: notes.length, categories: ordered.length, rootPath: root, superPath };
		onProgress({ phase: "complete", current: ordered.length + 1, total: ordered.length + 1, path: superPath, message: `Finished ${ordered.length} category MOCs and one super-MOC` });
		const suffix = errors.length ? ` ${errors.length} note(s) could not be classified and can be retried with Adjust recent note.` : "";
		return { ok: true, content: `Processed ${notes.length} note(s) incrementally into ${ordered.length} model-discovered categories. ${superPath} is the recommended starting point.${suffix}`, notesProcessed: notes.length, categories: ordered.length, rootPath: root, superPath };
	}

	private async classify(note: NoteForCategorization, onProgress: (progress: MocProgress) => void, current: number, total: number): Promise<string> {
		const properties = JSON.stringify(note.properties).slice(0, 1600);
		const prompt = `Classify exactly one Obsidian note into zero to four meaningful categories. A note may belong to multiple categories. Infer category names from its frontmatter properties and bounded excerpt; do not invent personal facts that are not present. Category names should be short and useful as MOC titles. For every category, describe what belongs inside it and cite the signals used. Return JSON only in this shape: {"categories":[{"name":"...","description":"...","reason":"..."}]}.\n\nNote path: ${note.path}\nModified: ${new Date(note.modified).toISOString()}\nFrontmatter: ${properties}\nBounded excerpt (not the full note):\n${note.excerpt}`;
		const request: ProviderRequest = {
			model: this.model,
			messages: [
				{ role: "system", content: "You are a careful information architect. Return valid JSON only. Do not include markdown fences or commentary." },
				{ role: "user", content: prompt },
			],
			tools: [],
		};
		const response = await this.complete(request, onProgress, current, total);
		return response.text;
	}

	private async loadExistingCategories(root: string, categories: Map<string, MocCategory>): Promise<void> {
		const categoryPaths = this.vault.getMarkdownFilesInFolder(root).filter((path) => !path.endsWith("/MOCs super.md"));
		for (const categoryPath of categoryPaths) {
			const content = await this.vault.readMarkdownFile(categoryPath);
			if (content === null) continue;
			const name = categoryPath.slice(root.length + 1).replace(/\.md$/i, "");
			if (!name || name === "MOCs super") continue;
			const key = categoryKey(name);
			const matches = [...content.matchAll(/^[-*]\s+\[\[([^\]]+)\]\]/gm)].map((match) => match[1] ?? "");
			const descriptionMatch = content.match(/## What belongs here\s*\n([^#]+)/i);
			categories.set(key, {
				name,
				description: trimText(descriptionMatch?.[1], "An existing model-discovered category.", MAX_DESCRIPTION_CHARS),
				reason: "Existing category retained during incremental adjustment.",
				notes: new Set(matches.map((path) => path.endsWith(".md") ? path : `${path}.md`)),
			});
		}
	}

	private renderCategory(category: MocCategory): string {
		const links = [...category.notes].sort((a, b) => a.localeCompare(b)).map((path) => `- ${noteLink(path)}`);
		return `# ${category.name}\n\n## What belongs here\n${categoryDescription(category)}\n\n## Why notes are assigned here\n${category.reason}\n\n## Notes\n${links.length ? links.join("\n") : "- No notes assigned yet."}\n`;
	}

	private async recommendCombinations(categories: MocCategory[], onProgress: (progress: MocProgress) => void, current: number): Promise<string[]> {
		const summary = categories.map((category) => ({ name: category.name, description: categoryDescription(category) }));
		const prompt = `Suggest up to eight useful two- or three-category starting sets for a super-MOC. Use only the category names and descriptions below. Return JSON only: {"combinations":[{"categories":["Category A","Category B"],"reason":"When this set is useful"}]}. Do not invent category names.\n\n${JSON.stringify(summary)}`;
		try {
				const response = await this.complete({
					model: this.model,
					messages: [
					{ role: "system", content: "You are an information architect. Return valid JSON only." },
					{ role: "user", content: prompt },
					],
					tools: [],
				}, onProgress, current, current);

			const validNames = new Set(categories.map((category) => categoryKey(category.name)));
			return parseCombinations(response.text)
				.map((item) => {
					const names = Array.isArray(item.categories) ? item.categories.filter((name): name is string => typeof name === "string").map(safeCategoryName) : [];
					const unique = [...new Set(names)].filter((name) => validNames.has(categoryKey(name)));
					const reason = trimText(item.reason, "Useful when the question crosses these areas.", MAX_DESCRIPTION_CHARS);
					return unique.length >= 2 ? `- ${unique.map((name) => `[[${name}]]`).join(" + ")} — ${reason}` : "";
				})
				.filter(Boolean);
					} catch {
				return [];
			}
		}

		private async complete(request: ProviderRequest, onProgress: (progress: MocProgress) => void, current: number, total: number) {
			const result = await completeWithModelFallback(this.provider, request, {
				enabled: this.autoFallback,
				configuredFallbackModels: this.fallbackModels,
					cooldowns: this.cooldowns,
					onEvent: (event) => {
						if (event.type === "checking") onProgress({ phase: "classifying", current, total, message: `${event.from} is unavailable or cooling down. Checking the ${this.provider.id} model catalogue…` });
						else if (event.type === "cooling_down") {
							const seconds = event.until ? Math.max(1, Math.ceil((event.until - Date.now()) / 1000)) : 60;
							const message = event.reason === "rate-limit" ? `Rate-limited: ${event.from} will be skipped for about ${seconds}s.` : `Model ${event.from} is unavailable and will be skipped for about ${seconds}s.`;
							onProgress({ phase: "classifying", current, total, message });
							this.onDiagnostic?.("warn", "moc-model-cooldown", message, event.from);
						} else if (event.to) {
							const message = `Trying ${event.to} after ${event.from} was unavailable.`;
							onProgress({ phase: "classifying", current, total, message });
							this.onDiagnostic?.("info", "moc-model-switch", message, event.to);
						}
					},
			});
			this.model = result.model;
			return result.response;
		}

		private renderSuper(root: string, categories: MocCategory[], recommendations: string[]): string {
		const categoryLines = categories.map((category) => `- [[${categoryFilePath(root, category.name).replace(/\.md$/i, "")}]] — ${categoryDescription(category)}`);
		const combinations: string[] = recommendations.map((line) => line.replace(/\[\[([^\]]+)\]\]/g, (_match, name: string) => `[[${categoryFilePath(root, name).replace(/\.md$/i, "")}]]`));
		for (let index = 0; index < categories.length && combinations.length < 8; index += 1) {
			for (let next = index + 1; next < categories.length && combinations.length < 8; next += 1) {
				const first = categories[index];
				const second = categories[next];
				if (!first || !second) continue;
				const overlap = [...first.notes].filter((path) => second.notes.has(path)).length;
				if (overlap > 0) combinations.push(`- [[${categoryFilePath(root, first.name).replace(/\.md$/i, "")}]] + [[${categoryFilePath(root, second.name).replace(/\.md$/i, "")}]] — start here when a question touches both categories (${overlap} shared note${overlap === 1 ? "" : "s"}).`);
			}
		}
		return `# MOCs super\n\n## How to use this map\nOpen the category MOC or combination that matches the question. Each linked category explains what it contains, and a note may appear in more than one category.\n\n## Categories\n${categoryLines.join("\n")}\n\n## Recommended starting sets\n${combinations.length ? combinations.join("\n") : "- Start with the category whose description most closely matches the question, then add a second category only when the question crosses domains."}\n`;
	}
}
