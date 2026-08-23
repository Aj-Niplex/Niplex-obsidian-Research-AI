import { Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import { AgentRuntime, type AgentEvent, type AgentRunResult } from "./core/agent-runtime";
import { DEFAULT_SETTINGS, type AgentSettings, type ChatMessage, type SavedChat, type ToolCall, type ToolDefinition, type ToolResult } from "./core/types";
import { VaultContext } from "./core/vault-context";
import { AgnesProvider } from "./providers/agnes";
import { GeminiProvider } from "./providers/gemini";
import { AgenticResearchSettingTab, type SettingsHost } from "./settings";
import { ApprovalModal } from "./ui/approval-modal";
import { AGENT_VIEW_TYPE, AgentView, type AgentViewHost } from "./ui/agent-view";

interface PersistedData {
	settings: AgentSettings;
	chats: SavedChat[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeChat(value: unknown): SavedChat | null {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.messages)) return null;
	return {
		id: value.id,
		title: value.title,
		createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
		updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
		provider: value.provider === "agnes" ? "agnes" : "gemini",
		model: typeof value.model === "string" ? value.model : "",
		messages: value.messages.filter((message): message is ChatMessage => isRecord(message) && typeof message.role === "string" && typeof message.content === "string"),
	};
}

export default class AgenticResearchPlugin extends Plugin implements SettingsHost, AgentViewHost {
	settings: AgentSettings = { ...DEFAULT_SETTINGS };
	private chats: SavedChat[] = [];

	async onload(): Promise<void> {
		const raw = await this.loadData() as Partial<AgentSettings> & Partial<PersistedData> | null;
		const savedSettings = raw && isRecord(raw.settings) ? raw.settings : raw;
		this.settings = { ...DEFAULT_SETTINGS, ...(savedSettings ?? {}) };
		this.chats = raw && Array.isArray(raw.chats) ? raw.chats.map(normalizeChat).filter((chat): chat is SavedChat => chat !== null) : [];

		this.registerView(AGENT_VIEW_TYPE, (leaf) => new AgentView(leaf, this));
		this.addRibbonIcon("search", "Open agentic research", () => void this.activateView());
		this.addCommand({
			id: "open-agentic-research",
			name: "Open agentic research",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "research-current-note",
			name: "Research current note with agentic research",
			callback: () => void this.activateView(),
		});
		this.addSettingTab(new AgenticResearchSettingTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.persistData();
	}

	setSecret(id: string, value: string): void {
		this.app.secretStorage.setSecret(id, value);
	}

	clearSecret(id: string): void {
		this.app.secretStorage.setSecret(id, "");
	}

	getSecret(id: string): string | null {
		return this.app.secretStorage.getSecret(id);
	}

	getChats(): SavedChat[] {
		return this.chats.map((chat) => ({ ...chat, messages: chat.messages.map((message) => ({ ...message })) }));
	}

	getChat(id: string): SavedChat | null {
		const chat = this.chats.find((candidate) => candidate.id === id);
		return chat ? { ...chat, messages: chat.messages.map((message) => ({ ...message })) } : null;
	}

	async saveChat(chat: SavedChat): Promise<void> {
		const next = { ...chat, updatedAt: Date.now(), messages: chat.messages.slice(-120) };
		this.chats = [next, ...this.chats.filter((candidate) => candidate.id !== chat.id)].slice(0, 30);
		await this.persistData();
	}

	async deleteChat(id: string): Promise<void> {
		this.chats = this.chats.filter((chat) => chat.id !== id);
		await this.persistData();
	}

	private async persistData(): Promise<void> {
		const data: PersistedData = { settings: this.settings, chats: this.chats };
		await this.saveData(data);
	}

	private getProvider(): GeminiProvider | AgnesProvider {
		const secretId = this.settings.provider === "gemini" ? "oar-gemini-api-key" : "oar-agnes-api-key";
		const key = this.getSecret(secretId) ?? "";
		return this.settings.provider === "gemini" ? new GeminiProvider(key) : new AgnesProvider(key);
	}

	private createVaultContext(): VaultContext {
		return new VaultContext(this.app, this.settings.stateFolder, this.settings.maxReadLines);
	}

	private createRuntime(): AgentRuntime {
		return new AgentRuntime(this.getProvider(), this.createVaultContext(), this.settings);
	}

	async runAgent(
		prompt: string,
		history: ChatMessage[],
		emit: (event: AgentEvent) => void,
	): Promise<AgentRunResult> {
		const hints: string[] = [];
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) hints.push(`The currently open note is ${activeFile.path}. Use tools to inspect it if relevant.`);
		if (this.settings.activeMocPath) {
			hints.push(`The user selected this Map of Content as the preferred scope: ${this.settings.activeMocPath}. Read it first, then follow only relevant links.`);
		}
		const enrichedPrompt = hints.length ? `${prompt}\n\n${hints.join("\n")}` : prompt;
		try {
			return await this.createRuntime().run(
				enrichedPrompt,
				(tool, call) => this.approveWrite(tool, call),
				emit,
				history,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Agent run failed.";
			emit({ type: "error", phase: "error", message });
			new Notice(message);
			throw error;
		}
	}

	getMocFiles(): string[] {
		return this.createVaultContext().getMocFiles();
	}

	getRecentMarkdownFiles(limit = 10): string[] {
		return this.createVaultContext().getRecentMarkdownFiles(limit);
	}

	async createMoc(path: string): Promise<ToolResult> {
		return this.createVaultContext().createMoc(path);
	}

	async adjustMoc(path: string): Promise<ToolResult> {
		return this.createVaultContext().adjustMoc(path);
	}

	async setActiveMoc(path: string): Promise<void> {
		this.settings.activeMocPath = path;
		await this.saveSettings();
	}

	private approveWrite(tool: ToolDefinition, call: ToolCall): Promise<boolean> {
		return new ApprovalModal(this.app, tool, call).confirm();
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(AGENT_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = Platform.isMobile ? workspace.getLeaf("tab") : workspace.getRightLeaf(false) ?? workspace.getLeaf("tab");
			await leaf.setViewState({ type: AGENT_VIEW_TYPE, active: true });
		}
		if (leaf) await workspace.revealLeaf(leaf);
		else new Notice("Could not open the agentic research view.");
	}
}
