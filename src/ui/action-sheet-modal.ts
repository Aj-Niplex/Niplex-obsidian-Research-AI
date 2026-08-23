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
		contentEl.createDiv({ cls: "oar-action-sheet-handle", attr: { "aria-hidden": "true" } });
		contentEl.createEl("h2", { text: "Research actions" });
		contentEl.createEl("p", { text: "Start with context. Open the less-used controls only when needed.", cls: "oar-muted" });

		const primary = contentEl.createDiv({ cls: "oar-action-section oar-action-primary" });
		primary.createEl("h3", { text: "Add to this research" });
		this.addActionCard(primary, "Attach files", "Select up to eight Markdown files. Only bounded windows are read.", () => this.host.onAttachFiles());
		this.addActionCard(primary, "Open MOC builder", "Create or adjust the map used to navigate your vault.", () => this.host.onOpenMoc());
		this.addActionCard(primary, "Continue research", "Resume from the last bounded run when it paused.", () => this.host.onContinue());

		const chat = this.addDisclosure(contentEl, "Chat history", "Search, switch, save, or delete local chats.");
		this.chatSearchEl = chat.createEl("input", { type: "search", placeholder: "Search saved chats…", cls: "oar-action-search", attr: { "aria-label": "Search saved chats" } });
		this.chatSearchEl.addEventListener("input", () => this.refreshChats());
		this.chatSelectEl = chat.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Saved chat" } });
		this.chatSelectEl.addEventListener("change", () => {
			const id = this.chatSelectEl.value;
			if (id && id !== this.host.currentChat.id) {
				this.host.onSelectChat(id);
				this.close();
			}
		});
		const chatActions = chat.createDiv({ cls: "oar-action-button-grid" });
		this.addButton(chatActions, "New chat", () => this.host.onNewChat());
		this.addButton(chatActions, "Save current", () => this.host.onSaveChat());
		this.deleteButton = this.addButton(chatActions, "Delete current", () => this.host.onDeleteChat());
		this.refreshChats();

		const provider = this.addDisclosure(contentEl, "Provider and model", "Change the provider or account-accessible model used on the next turn.");
		const providerSelect = provider.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Provider" } });
		providerSelect.add(new Option("Google Gemini", "gemini"));
		providerSelect.add(new Option("Agnes AI", "agnes"));
		providerSelect.value = this.host.settings.provider;
		providerSelect.addEventListener("change", () => void this.changeProvider(providerSelect.value as ProviderId));
		this.modelSelectEl = provider.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Model" } });
		this.modelSelectEl.addEventListener("change", () => void this.host.onModelChange(this.modelSelectEl.value));
		void this.refreshModels();

		const more = this.addDisclosure(contentEl, "More tools", "View transparent prompts or open redacted diagnostics.");
		this.addActionCard(more, "View prompts", "Read the protected policy and edit only the additive prompt.", () => this.host.onOpenPrompts());
		this.addActionCard(more, "Open logs", "Review local redacted diagnostics.", () => this.host.onOpenLogs());
	}

	private addDisclosure(root: HTMLElement, title: string, description: string): HTMLElement {
		const details = root.createEl("details", { cls: "oar-action-disclosure" });
		const summary = details.createEl("summary");
		summary.createEl("strong", { text: title });
		summary.createEl("small", { text: description });
		return details.createDiv({ cls: "oar-action-disclosure-body" });
	}

	private addActionCard(root: HTMLElement, label: string, description: string, callback: () => void): void {
		const button = root.createEl("button", { cls: "oar-action-card" });
		button.createEl("strong", { text: label });
		button.createEl("small", { text: description });
		button.addEventListener("click", () => {
			callback();
			this.close();
		});
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
