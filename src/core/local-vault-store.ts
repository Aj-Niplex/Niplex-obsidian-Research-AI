import { App, TFile } from "obsidian";
import { sanitizeVaultPath } from "./path-utils";
import type { ChatMessage, SavedChat } from "./types";
import { CONTEXT_BUDGETS } from "./context-budget";

export const NIPLEX_ROOT = "NIPLEX-OBSIDIAN";
export const NIPLEX_CHATS = `${NIPLEX_ROOT}/Chats`;
export const NIPLEX_PROMPTS = `${NIPLEX_ROOT}/Prompts`;
export const NIPLEX_MEMORY = `${NIPLEX_ROOT}/Memory`;
export const NIPLEX_SKILLS = `${NIPLEX_ROOT}/Skills`;
export const NIPLEX_RUNTIME = `${NIPLEX_ROOT}/Runtime`;
export const NIPLEX_MOCS = `${NIPLEX_ROOT}/MOCs`;
export const NIPLEX_AGENT_PROTECTED_FOLDERS = [NIPLEX_CHATS, NIPLEX_PROMPTS, NIPLEX_MEMORY, NIPLEX_SKILLS, NIPLEX_RUNTIME] as const;

export interface InstalledSkill {
	code: string;
	prompt: string;
	settingsPatch: Partial<Pick<import("./types").AgentSettings, "maxIterations" | "maxReadLines" | "maxToolResultChars">>;
}

const START_MARKER = "<!-- niplex-chat-data-start -->";
const END_MARKER = "<!-- niplex-chat-data-end -->";
const PROMPT_PATH = `${NIPLEX_PROMPTS}/User system prompt.md`;
const PROMPT_START = "<!-- niplex-user-prompt-start -->";
const PROMPT_END = "<!-- niplex-user-prompt-end -->";

function chatFilePath(id: string): string {
	const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "chat";
	return `${NIPLEX_CHATS}/chat-${safeId}.md`;
}

function renderMessage(message: ChatMessage): string {
	const heading = message.role === "user" ? "You" : message.role === "assistant" ? "Agent" : message.role === "tool" ? `Tool: ${message.toolName ?? "vault tool"}` : "System";
	return `## ${heading}\n\n${message.content}\n`;
}

function serializeChat(chat: SavedChat): string {
	const safeMessages = chat.messages.filter((message) => message.role !== "system");
	const payload = JSON.stringify({ ...chat, messages: safeMessages }, null, 2);
	const body = safeMessages.map(renderMessage).join("\n");
	return `---\nniplex: chat\nid: ${chat.id}\ntitle: ${JSON.stringify(chat.title)}\nupdated: ${chat.updatedAt}\n---\n\n# ${chat.title.replace(/[#\r\n]/g, " ").trim() || "Research chat"}\n\n${body}\n${START_MARKER}\n${payload}\n${END_MARKER}\n`;
}

function parseChat(content: string): Record<string, unknown> | null {
	const start = content.indexOf(START_MARKER);
	const end = content.indexOf(END_MARKER, start + START_MARKER.length);
	if (start < 0 || end < 0) return null;
	try {
		const parsed: unknown = JSON.parse(content.slice(start + START_MARKER.length, end).trim());
		return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split("/");
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
	}
}

export class LocalVaultStore {
	constructor(private readonly app: App) {}

	async ensureStructure(): Promise<void> {
		for (const folder of [NIPLEX_ROOT, NIPLEX_CHATS, NIPLEX_PROMPTS, NIPLEX_MEMORY, NIPLEX_SKILLS, NIPLEX_RUNTIME, NIPLEX_MOCS]) await ensureFolder(this.app, folder);
	}

	async loadChats(normalize: (value: unknown) => SavedChat | null): Promise<SavedChat[]> {
		const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${NIPLEX_CHATS}/`));
		const chats: SavedChat[] = [];
		for (const file of files.slice(0, 100)) {
			const parsed = normalize(parseChat(await this.app.vault.read(file)));
			if (parsed) chats.push(parsed);
		}
		return chats.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
	}

	async loadUserPrompt(): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(PROMPT_PATH);
		if (!(file instanceof TFile)) return null;
		const content = await this.app.vault.read(file);
		const start = content.indexOf(PROMPT_START);
		const end = content.indexOf(PROMPT_END, start + PROMPT_START.length);
		return start >= 0 && end >= 0 ? content.slice(start + PROMPT_START.length, end).trim().slice(0, CONTEXT_BUDGETS.maxUserPromptChars) : null;
	}

	async loadInstalledSkills(): Promise<InstalledSkill[]> {
		const skills: InstalledSkill[] = [];
		for (const file of this.app.vault.getMarkdownFiles().filter((candidate) => candidate.path.startsWith(`${NIPLEX_SKILLS}/`) && candidate.name === "SKILL.md").slice(0, 20)) {
			const code = file.path.slice(`${NIPLEX_SKILLS}/`.length).split("/")[0] ?? "";
			if (!/^[A-Z0-9]{5}$/.test(code)) continue;
			const manifestFile = this.app.vault.getAbstractFileByPath(`${NIPLEX_SKILLS}/${code}/skill.json`);
			if (!(manifestFile instanceof TFile)) continue;
			try {
				const raw: unknown = JSON.parse(await this.app.vault.read(manifestFile));
				if (!raw || typeof raw !== "object") continue;
				const source = raw as Record<string, unknown>;
				if (source.code !== code || typeof source.prompt !== "string" || !source.prompt.trim()) continue;
				const patch: InstalledSkill["settingsPatch"] = {};
				if (source.settingsPatch && typeof source.settingsPatch === "object") {
					for (const key of ["maxIterations", "maxReadLines", "maxToolResultChars"] as const) {
						const value = (source.settingsPatch as Record<string, unknown>)[key];
						if (typeof value === "number" && Number.isFinite(value)) patch[key] = Math.floor(value);
					}
				}
				skills.push({ code, prompt: source.prompt.trim().slice(0, CONTEXT_BUDGETS.maxSkillGuidanceChars), settingsPatch: patch });
			} catch {
				// Ignore malformed local packages; the helper validates packages before installation.
			}
		}
		return skills;
	}

	async saveUserPrompt(prompt: string): Promise<void> {
		await this.ensureStructure();
		const content = `# User system prompt\n\nThis file is an additive preference only. Do not put API keys, passwords, or private tokens here.\n\n${PROMPT_START}\n${prompt.trim().slice(0, CONTEXT_BUDGETS.maxUserPromptChars)}\n${PROMPT_END}\n`;
		const existing = this.app.vault.getAbstractFileByPath(PROMPT_PATH);
		if (existing instanceof TFile) await this.app.vault.modify(existing, content);
		else await this.app.vault.create(PROMPT_PATH, content);
	}

	async saveChat(chat: SavedChat): Promise<void> {
		await this.ensureStructure();
		const path = sanitizeVaultPath(chatFilePath(chat.id));
		if (!path) throw new Error("Invalid local chat path.");
		const existing = this.app.vault.getAbstractFileByPath(path);
		const content = serializeChat(chat);
		if (existing instanceof TFile) await this.app.vault.modify(existing, content);
		else await this.app.vault.create(path, content);
	}

	async deleteChat(id: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(chatFilePath(id));
		if (file) await this.app.fileManager.trashFile(file);
	}
}
