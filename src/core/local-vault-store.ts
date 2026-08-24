import { App, TFile } from "obsidian";
import { sanitizeVaultPath } from "./path-utils";
import type { ChatMessage, InstalledSkill, SavedChat } from "./types";
import { compactChatMessages } from "./chat-history";
import { CONTEXT_BUDGETS } from "./context-budget";
import { parseReadableChat } from "./readable-chat";

export const NIPLEX_ROOT = "NIPLEX-OBSIDIAN";
export const NIPLEX_CHATS = `${NIPLEX_ROOT}/Chats`;
export const NIPLEX_PROMPTS = `${NIPLEX_ROOT}/Prompts`;
export const NIPLEX_MEMORY = `${NIPLEX_ROOT}/Memory`;
export const NIPLEX_MEMORY_FILE = `${NIPLEX_MEMORY}/User memory.md`;
export const NIPLEX_SKILLS = `${NIPLEX_ROOT}/Skills`;
export const NIPLEX_RUNTIME = `${NIPLEX_ROOT}/Runtime`;
export const NIPLEX_RUNTIME_CHATS = `${NIPLEX_RUNTIME}/Chats`;
export const NIPLEX_MOCS = `${NIPLEX_ROOT}/MOCs`;
export const NIPLEX_AGENT_PROTECTED_FOLDERS = [NIPLEX_CHATS, NIPLEX_PROMPTS, NIPLEX_MEMORY, NIPLEX_SKILLS, NIPLEX_RUNTIME] as const;

const START_MARKER = "<!-- niplex-chat-data-start -->";
const END_MARKER = "<!-- niplex-chat-data-end -->";
const PROMPT_PATH = `${NIPLEX_PROMPTS}/User system prompt.md`;
export const USER_MEMORY_START = "<!-- niplex-user-memory-start -->";
export const USER_MEMORY_END = "<!-- niplex-user-memory-end -->";
const PROMPT_START = "<!-- niplex-user-prompt-start -->";
const PROMPT_END = "<!-- niplex-user-prompt-end -->";

function chatFilePath(id: string): string {
	const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "chat";
	return `${NIPLEX_CHATS}/chat-${safeId}.md`;
}

function runtimeChatFilePath(id: string): string {
	const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "chat";
	return `${NIPLEX_RUNTIME_CHATS}/chat-${safeId}.json`;
}

function renderMessage(message: ChatMessage): string {
	const heading = message.role === "user" ? "You" : "Agent";
	return `## ${heading}\n\n${message.content}\n`;
}

function boundedActivity(activity: string[] | undefined): string[] {
	return [...new Set((activity ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 24);
}

function serializeChat(chat: SavedChat): string {
	const safeMessages = compactChatMessages(chat.messages);
	const subject = (chat.subject ?? chat.title).replace(/[#\r\n]/g, " ").trim() || "Research chat";
	const body = safeMessages.map(renderMessage).join("\n");
	const activity = boundedActivity(chat.activity);
	const activityBlock = activity.length ? `\n## Activity summary\n\n${activity.map((item) => `- ${item}`).join("\n")}\n` : "";
	return `---\nniplex: chat\nid: ${chat.id}\ntitle: ${JSON.stringify(subject)}\nsubject: ${JSON.stringify(subject)}\nupdated: ${chat.updatedAt}\n---\n\n# ${subject}\n\n${body}${activityBlock}`;
}

function serializeRuntimeChat(chat: SavedChat): string {
	const subject = (chat.subject ?? chat.title).replace(/[\r\n]/g, " ").trim() || "Research chat";
	return JSON.stringify({
		...chat,
		title: subject,
		subject,
		messages: compactChatMessages(chat.messages),
		activity: boundedActivity(chat.activity),
	}, null, 2);
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

function serializeUserMemory(content: string): string {
	const bounded = content.trim().slice(0, CONTEXT_BUDGETS.maxMemoryChars);
	return `# User memory\n\nThis is editable personalization data. Review it regularly and do not store API keys, passwords, or private tokens here.\n\n${USER_MEMORY_START}\n${bounded}\n${USER_MEMORY_END}\n`;
}

export class LocalVaultStore {
	constructor(private readonly app: App) {}

	async ensureStructure(): Promise<void> {
		for (const folder of [NIPLEX_ROOT, NIPLEX_CHATS, NIPLEX_PROMPTS, NIPLEX_MEMORY, NIPLEX_SKILLS, NIPLEX_RUNTIME, NIPLEX_RUNTIME_CHATS, NIPLEX_MOCS]) await ensureFolder(this.app, folder);
		if (!this.app.vault.getAbstractFileByPath(NIPLEX_MEMORY_FILE)) await this.app.vault.create(NIPLEX_MEMORY_FILE, serializeUserMemory(""));
	}

	async loadChats(normalize: (value: unknown) => SavedChat | null): Promise<SavedChat[]> {
		const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${NIPLEX_CHATS}/`));
		const chats: SavedChat[] = [];
		for (const file of files.slice(0, 100)) {
			const content = await this.app.vault.read(file);
			const legacy = parseChat(content);
			const readable = parseReadableChat(content);
			const candidateId = typeof legacy?.id === "string" ? legacy.id : typeof readable?.id === "string" ? readable.id : "";
			let runtime: Record<string, unknown> | null = null;
			if (candidateId) {
				const runtimeFile = this.app.vault.getAbstractFileByPath(runtimeChatFilePath(candidateId));
				if (runtimeFile instanceof TFile) {
					try {
						const parsed: unknown = JSON.parse(await this.app.vault.read(runtimeFile));
						if (parsed && typeof parsed === "object") runtime = parsed as Record<string, unknown>;
					} catch {
						// Fall back to the visible transcript or legacy marker when runtime state is malformed.
					}
				}
			}
			const parsed = normalize(runtime ?? legacy ?? readable);
			if (parsed) chats.push(parsed);
		}
		return chats.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
	}

	async loadUserMemory(): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(NIPLEX_MEMORY_FILE);
		if (!(file instanceof TFile)) return "";
		const content = await this.app.vault.read(file);
		const start = content.indexOf(USER_MEMORY_START);
		const end = content.indexOf(USER_MEMORY_END, start + USER_MEMORY_START.length);
		return start >= 0 && end >= 0 ? content.slice(start + USER_MEMORY_START.length, end).trim().slice(0, CONTEXT_BUDGETS.maxMemoryChars) : "";
	}

	async saveUserMemory(content: string): Promise<void> {
		await this.ensureStructure();
		const body = serializeUserMemory(content);
		const existing = this.app.vault.getAbstractFileByPath(NIPLEX_MEMORY_FILE);
		if (existing instanceof TFile) await this.app.vault.modify(existing, body);
		else await this.app.vault.create(NIPLEX_MEMORY_FILE, body);
	}

	async appendUserMemory(content: string): Promise<void> {
		const current = await this.loadUserMemory();
		const addition = content.trim();
		if (!addition) return;
		await this.saveUserMemory([current, addition].filter(Boolean).join("\n\n"));
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
					const name = typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 80) : code;
					const version = typeof source.version === "string" && source.version.trim() ? source.version.trim().slice(0, 40) : "installed";
					const description = typeof source.description === "string" ? source.description.trim().slice(0, 360) : "Installed instruction skill.";
					skills.push({ code, name, version, description, prompt: source.prompt.trim().slice(0, CONTEXT_BUDGETS.maxSkillGuidanceChars), settingsPatch: patch });
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
		const subject = (chat.subject ?? chat.title).replace(/[\r\n]/g, " ").trim() || "Research chat";
		const safeChat: SavedChat = { ...chat, title: subject, subject, messages: compactChatMessages(chat.messages), activity: boundedActivity(chat.activity), skillCodes: [...new Set((chat.skillCodes ?? []).filter((code) => /^[A-Z0-9]{5}$/.test(code)))].slice(0, 8) };
		const path = sanitizeVaultPath(chatFilePath(safeChat.id));
		const runtimePath = sanitizeVaultPath(runtimeChatFilePath(safeChat.id));
		if (!path || !runtimePath) throw new Error("Invalid local chat path.");
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) await this.app.vault.modify(existing, serializeChat(safeChat));
		else await this.app.vault.create(path, serializeChat(safeChat));
		const runtimeFile = this.app.vault.getAbstractFileByPath(runtimePath);
		if (runtimeFile instanceof TFile) await this.app.vault.modify(runtimeFile, serializeRuntimeChat(safeChat));
		else await this.app.vault.create(runtimePath, serializeRuntimeChat(safeChat));
	}

	async deleteChat(id: string): Promise<void> {
		for (const path of [chatFilePath(id), runtimeChatFilePath(id)]) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file) await this.app.fileManager.trashFile(file);
		}
	}
}
