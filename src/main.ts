import { Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import { AgentRuntime, type AgentEvent } from "./core/agent-runtime";
import { DEFAULT_SETTINGS, type AgentSettings, type ToolCall, type ToolDefinition } from "./core/types";
import { VaultContext } from "./core/vault-context";
import { AgnesProvider } from "./providers/agnes";
import { GeminiProvider } from "./providers/gemini";
import { AgenticResearchSettingTab, type SettingsHost } from "./settings";
import { ApprovalModal } from "./ui/approval-modal";
import { AGENT_VIEW_TYPE, AgentView, type AgentViewHost } from "./ui/agent-view";

export default class AgenticResearchPlugin extends Plugin implements SettingsHost, AgentViewHost {
	settings: AgentSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		const saved = (await this.loadData()) as Partial<AgentSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };

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
		await this.saveData(this.settings);
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

	private getProvider(): GeminiProvider | AgnesProvider {
		const secretId = this.settings.provider === "gemini" ? "oar-gemini-api-key" : "oar-agnes-api-key";
		const key = this.getSecret(secretId) ?? "";
		return this.settings.provider === "gemini" ? new GeminiProvider(key) : new AgnesProvider(key);
	}

	private createRuntime(): AgentRuntime {
		const context = new VaultContext(this.app, this.settings.stateFolder, this.settings.maxReadLines);
		return new AgentRuntime(this.getProvider(), context, this.settings);
	}

	async runAgent(prompt: string, emit: (event: AgentEvent) => void): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		const enrichedPrompt = activeFile ? `${prompt}\n\nThe currently open note is ${activeFile.path}. Use tools to inspect it if relevant.` : prompt;
		try {
			const result = await this.createRuntime().run(
				enrichedPrompt,
				(tool, call) => this.approveWrite(tool, call),
				emit,
			);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Agent run failed.";
			emit({ type: "error", message });
			new Notice(message);
			throw error;
		}
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
