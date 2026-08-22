import { App, TFile, Vault } from "obsidian";
import { sanitizeVaultPath } from "./path-utils";
import type { BoundedReadResult, SearchHit, ToolDefinition, ToolResult } from "./types";

const MAX_LIST_RESULTS = 250;
const MAX_SEARCH_HITS = 40;
const MAX_SNIPPET_CHARS = 320;

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.floor(value));
}

function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

export class VaultContext {
	constructor(
		private readonly app: App,
		private readonly protectedFolder: string,
		private readonly maxReadLines: number,
	) {}

	private get vault(): Vault {
		return this.app.vault;
	}

	private isProtected(path: string): boolean {
		const normalized = path.replace(/^\/+/, "");
		const configDir = this.vault.configDir.replace(/^\/+|\/+$/g, "");
		const protectedFolder = this.protectedFolder.replace(/^\/+|\/+$/g, "");
		return (
			normalized === configDir ||
			normalized.startsWith(`${configDir}/`) ||
			normalized === protectedFolder ||
			normalized.startsWith(`${protectedFolder}/`)
		);
	}

	private getMarkdownFile(path: string): TFile | null {
		const file = this.vault.getAbstractFileByPath(path);
		return file instanceof TFile && file.extension.toLowerCase() === "md" ? file : null;
	}

	async listFiles(query = ""): Promise<ToolResult> {
		const needle = query.trim().toLowerCase();
		const files = this.vault
			.getMarkdownFiles()
			.filter((file) => !this.isProtected(file.path))
			.filter((file) => !needle || file.path.toLowerCase().includes(needle))
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, MAX_LIST_RESULTS)
			.map((file) => ({
				path: file.path,
				bytes: file.stat.size,
				modified: new Date(file.stat.mtime).toISOString(),
			}));

		return {
			ok: true,
			content: json({ files, truncated: files.length === MAX_LIST_RESULTS }),
		};
	}

	async readFileChunk(path: string, startLine = 1, maxLines = this.maxReadLines): Promise<ToolResult> {
		const cleanPath = sanitizeVaultPath(path);
		if (!cleanPath) return { ok: false, isError: true, content: "Invalid vault-relative path." };
		if (this.isProtected(cleanPath)) return { ok: false, isError: true, content: "That folder is protected." };
		const file = this.getMarkdownFile(cleanPath);
		if (!file) return { ok: false, isError: true, content: `Markdown file not found: ${path}` };

		const safeStart = asPositiveInt(startLine, 1);
		const safeMaxLines = Math.min(asPositiveInt(maxLines, this.maxReadLines), this.maxReadLines);
		const text = await this.vault.read(file);
		const lines = text.split(/\r?\n/);
		const startIndex = safeStart - 1;
		const selected = lines.slice(startIndex, startIndex + safeMaxLines);
		const endLine = selected.length === 0 ? safeStart - 1 : safeStart + selected.length - 1;
		const hasMore = startIndex + selected.length < lines.length;
		const result: BoundedReadResult = {
			path: cleanPath,
			startLine: safeStart,
			endLine,
			totalLines: lines.length,
			hasMore,
			nextStartLine: hasMore ? endLine + 1 : null,
			content: selected.join("\n"),
		};
		return { ok: true, content: json(result) };
	}

	async searchVault(query: string, maxHits = 20): Promise<ToolResult> {
		const needle = query.trim().toLowerCase();
		if (!needle) return { ok: false, isError: true, content: "A non-empty search query is required." };

		const hits: SearchHit[] = [];
		for (const file of this.vault.getMarkdownFiles()) {
			if (hits.length >= Math.min(asPositiveInt(maxHits, 20), MAX_SEARCH_HITS)) break;
			if (this.isProtected(file.path)) continue;
			const lines = (await this.vault.read(file)).split(/\r?\n/);
			for (let index = 0; index < lines.length; index += 1) {
				const line = lines[index] ?? "";
				if (!line.toLowerCase().includes(needle)) continue;
				hits.push({
					path: file.path,
					line: index + 1,
					snippet: line.length > MAX_SNIPPET_CHARS ? `${line.slice(0, MAX_SNIPPET_CHARS)}…` : line,
				});
				if (hits.length >= Math.min(asPositiveInt(maxHits, 20), MAX_SEARCH_HITS)) break;
			}
		}
		return { ok: true, content: json({ query, hits, truncated: hits.length >= MAX_SEARCH_HITS }) };
	}

	async createNote(path: string, content: string): Promise<ToolResult> {
		const cleanPath = sanitizeVaultPath(path);
		if (!cleanPath || !cleanPath.toLowerCase().endsWith(".md")) {
			return { ok: false, isError: true, content: "The note path must end with .md." };
		}
		if (this.isProtected(cleanPath)) return { ok: false, isError: true, content: "That folder is protected." };
		if (this.vault.getAbstractFileByPath(cleanPath)) return { ok: false, isError: true, content: `Path already exists: ${cleanPath}` };
		await this.vault.create(cleanPath, content);
		return { ok: true, content: `Created ${cleanPath}` };
	}

	async appendNote(path: string, content: string): Promise<ToolResult> {
		const cleanPath = sanitizeVaultPath(path);
		if (!cleanPath) return { ok: false, isError: true, content: "Invalid vault-relative path." };
		if (this.isProtected(cleanPath)) return { ok: false, isError: true, content: "That folder is protected." };
		const file = this.getMarkdownFile(cleanPath);
		if (!file) return { ok: false, isError: true, content: `Markdown file not found: ${cleanPath}` };
		await this.vault.append(file, `\n${content}`);
		return { ok: true, content: `Appended content to ${cleanPath}` };
	}

	getToolDefinitions(): ToolDefinition[] {
		return [
			{
				name: "list_files",
				description: "List Markdown files by path. Returns metadata only, never file contents.",
				readOnly: true,
				parameters: {
					type: "object",
					properties: { query: { type: "string", description: "Optional path substring filter." } },
				},
			},
			{
				name: "search_vault",
				description: "Search Markdown notes and return bounded matching snippets with line numbers.",
				readOnly: true,
				parameters: {
					type: "object",
					properties: {
						query: { type: "string", description: "Text to search for." },
						maxHits: { type: "integer", description: "Maximum number of hits, capped by the plugin." },
					},
					required: ["query"],
				},
			},
			{
				name: "read_file_chunk",
				description: "Read a bounded line window from one Markdown note. Request another window using nextStartLine when needed.",
				readOnly: true,
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "Vault-relative Markdown path." },
						startLine: { type: "integer", description: "1-based starting line." },
						maxLines: { type: "integer", description: "Requested line count, capped by the plugin." },
					},
					required: ["path"],
				},
			},
			{
				name: "create_note",
				description: "Create a new Markdown note. This is a write action and requires user approval.",
				readOnly: false,
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "Vault-relative .md path." },
						content: { type: "string", description: "Complete note content." },
					},
					required: ["path", "content"],
				},
			},
			{
				name: "append_note",
				description: "Append text to an existing Markdown note. This is a write action and requires user approval.",
				readOnly: false,
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "Vault-relative .md path." },
						content: { type: "string", description: "Text to append." },
					},
					required: ["path", "content"],
				},
			},
		];
	}

	async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
		switch (name) {
			case "list_files":
				return this.listFiles(asString(args.query));
			case "search_vault":
				return this.searchVault(asString(args.query), asPositiveInt(args.maxHits, 20));
			case "read_file_chunk":
				return this.readFileChunk(asString(args.path), asPositiveInt(args.startLine, 1), asPositiveInt(args.maxLines, this.maxReadLines));
			case "create_note":
				return this.createNote(asString(args.path), asString(args.content));
			case "append_note":
				return this.appendNote(asString(args.path), asString(args.content));
			default:
				return { ok: false, isError: true, content: `Unknown tool: ${name}` };
		}
	}
}
