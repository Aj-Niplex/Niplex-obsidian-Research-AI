import { App, Modal, Notice } from "obsidian";
import type { AgentSettings, ProviderId, ProviderModel, SavedChat } from "../core/types";

export interface ActionSheetHost {
	settings: AgentSettings;
	currentChat: SavedChat;
	currentChatPersisted: boolean;
	getChats(): SavedChat[];
	getChat(id: string): SavedChat | null;
	getModelCatalogue(provider: ProviderId, forceRefresh?: boolean): Promise<ProviderModel[]>;
	onNewChat(): void;
	onSaveChat(): Promise<void>;
	onDeleteChat(): Promise<void>;
	onSelectChat(id: string): void;
	onAttachFiles(): void;
	onOpenMoc(): void;
	onContinue(): void;
	onProviderChange(provider: ProviderId): Promise<void>;
	onModelChange(model: string): Promise<void>;
	onOpenLogs(): void;
	onOpenPrompts(): void;
}

export class ActionSheetModal extends Modal {
	private readonly host: ActionSheetHost;
	private chatSearchEl!: HTMLInputElement;
	private chatSelectEl!: HTMLSelectElement;
	private providerSelectEl!: HTMLSelectElement;
	private modelSelectEl!: HTMLSelectElement;
	private deleteButton!: HTMLButtonElement;

	constructor(app: App, host: ActionSheetHost) {
		super(app);
		this.host = host;
	}

	onOpen(): void {
		this.modalEl.addClass("oar-action-sheet-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-action-sheet");

		const handle = contentEl.createDiv({ cls: "oar-action-sheet-handle", attr: { "aria-hidden": "true" } });
		handle.setAttribute("role", "presentation");
		contentEl.createEl("h2", { text: "Research actions" });
		contentEl.createEl("p", { text: "Keep the workspace focused. Open tools only when you need them.", cls: "oar-muted" });

		this.addSection(contentEl, "Add to research", [
			["Attach files", "Choose specific Markdown files. Only bounded context is sent.", () => this.host.onAttachFiles()],
			["Open MOC builder", "Create or adjust your vault map.", () => this.host.onOpenMoc()],
			["Continue research", "Resume from the existing bounded evidence.", () => this.host.onContinue()],
		]);

		const chatSection = contentEl.createDiv({ cls: "oar-action-section" });
		chatSection.createEl("h3", { text: "Chat" });
		this.chatSearchEl = chatSection.createEl("input", { type: "search", placeholder: "Search saved chats…", cls: "oar-action-search", attr: { "aria-label": "Search saved chats" } });
		this.chatSearchEl.addEventListener("input", () => this.refreshChats());
		this.chatSelectEl = chatSection.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Saved chat" } });
		this.chatSelectEl.addEventListener("change", () => {
			const id = this.chatSelectEl.value;
			if (id && id !== this.host.currentChat.id) {
				this.host.onSelectChat(id);
				this.close();
			}
		});
		const chatActions = chatSection.createDiv({ cls: "oar-action-button-grid" });
		this.addButton(chatActions, "New chat", () => { this.host.onNewChat(); this.close(); });
		this.addButton(chatActions, "Save current", () => void this.host.onSaveChat());
		this.deleteButton = this.addButton(chatActions, "Delete current", () => void this.host.onDeleteChat());
		this.refreshChats();

		const providerSection = contentEl.createDiv({ cls: "oar-action-section" });
		providerSection.createEl("h3", { text: "Provider and model" });
		const providerRow = providerSection.createDiv({ cls: "oar-action-control-row" });
		this.providerSelectEl = providerRow.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Provider" } });
		this.providerSelectEl.add(new Option("Google Gemini", "gemini"));
		this.providerSelectEl.add(new Option("Agnes AI", "agnes"));
		this.providerSelectEl.value = this.host.settings.provider;
		this.providerSelectEl.addEventListener("change", () => void this.changeProvider(this.providerSelectEl.value as ProviderId));
		this.modelSelectEl = providerRow.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Model" } });
		this.modelSelectEl.addEventListener("change", () => void this.host.onModelChange(this.modelSelectEl.value));
		void this.refreshModels();

		this.addSection(contentEl, "More", [
			["View prompts", "See the protected policy and additive user prompt.", () => this.host.onOpenPrompts()],
			["Open logs", "Review redacted diagnostics.", () => this.host.onOpenLogs()],
		]);
	}

	private addSection(root: HTMLElement, title: string, actions: Array<[string, string, () => void]>): void {
		const section = root.createDiv({ cls: "oar-action-section" });
		section.createEl("h3", { text: title });
		const grid = section.createDiv({ cls: "oar-action-button-grid" });
		for (const [label, description, callback] of actions) {
			const button = grid.createEl("button", { cls: "oar-action-card" });
			button.createEl("strong", { text: label });
			button.createEl("small", { text: description });
			button.addEventListener("click", () => {
				callback();
				this.close();
			});
		}
	}

	private addButton(root: HTMLElement, label: string, callback: () => void | Promise<void>): HTMLButtonElement {
		const button = root.createEl("button", { text: label });
		button.addEventListener("click", () => {
			void callback();
			this.close();
		});
		return button;
	}

	private refreshChats(): void {
		if (!this.chatSelectEl) return;
		this.chatSelectEl.empty();
		this.chatSelectEl.add(new Option("Current chat", this.host.currentChat.id));
		const query = this.chatSearchEl?.value.trim().toLowerCase() ?? "";
		for (const chat of this.host.getChats()) {
			if (chat.id === this.host.currentChat.id) continue;
			const haystack = `${chat.title}\n${chat.messages.map((message) => message.content).join("\n")}`.toLowerCase();
			if (query && !haystack.includes(query)) continue;
			this.chatSelectEl.add(new Option(chat.title, chat.id));
		}
		this.chatSelectEl.value = this.host.currentChat.id;
		if (this.deleteButton) this.deleteButton.disabled = !this.host.currentChatPersisted;
	}

	private async changeProvider(provider: ProviderId): Promise<void> {
		await this.host.onProviderChange(provider);
		await this.refreshModels();
		new Notice(`Next agent turn will use ${this.modelSelectEl.value || "the selected provider"}.`);
	}

	private async refreshModels(): Promise<void> {
		if (!this.modelSelectEl) return;
		const provider = this.host.settings.provider;
		const selected = provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
		let models: ProviderModel[] = [];
		try {
			models = await this.host.getModelCatalogue(provider);
		} catch {
			models = [];
		}
		this.modelSelectEl.empty();
		for (const model of models.length ? models : [{ id: selected, label: `${selected} · catalogue unavailable` }]) this.modelSelectEl.add(new Option(model.label, model.id));
		this.modelSelectEl.value = selected;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
