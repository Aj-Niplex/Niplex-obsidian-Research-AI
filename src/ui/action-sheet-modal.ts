import { App, Modal, Notice } from "obsidian";
import type { AgentSettings, ProviderId, ProviderModel, QuickActionId, SavedChat, WindowSize } from "../core/types";
import type { NiplexActionSummary } from "../core/ecosystem";
import { searchableChatText } from "../core/chat-history";

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
	onOpenChatHistory(): void;
	onAttachFiles(): void;
	onOpenMoc(): void;
	onContinue(): void;
	onProviderChange(provider: ProviderId): Promise<void>;
	onModelChange(model: string): Promise<void>;
	onQuickActionsChange(actions: QuickActionId[]): Promise<void>;
	onOpenLogs(): void;
	onOpenPrompts(): void;
	onOpenMemory(): Promise<void>;
	onWindowSizeChange(size: WindowSize): Promise<void>;
	getEcosystemActions(): NiplexActionSummary[];
	onEcosystemAction(action: NiplexActionSummary): Promise<void>;
}

const QUICK_ACTIONS: Array<{ id: QuickActionId; label: string; icon: string }> = [
	{ id: "history", label: "Chat history", icon: "history" },
	{ id: "attach", label: "Add files or folder", icon: "paperclip" },
	{ id: "moc", label: "MOC builder", icon: "map" },
	{ id: "continue", label: "Continue research", icon: "rotate-ccw" },
	{ id: "prompts", label: "View prompts", icon: "scroll-text" },
	{ id: "logs", label: "Open logs", icon: "activity" },
];

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
		this.modalEl.parentElement?.addClass("oar-bottom-sheet-container");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-action-sheet");
		contentEl.createDiv({ cls: "oar-action-sheet-handle", attr: { "aria-hidden": "true" } });
		contentEl.createEl("h2", { text: "Actions" });
		contentEl.createEl("p", { text: "Keep the workspace focused. Open tools only when you need them.", cls: "oar-muted" });

		const primary = contentEl.createDiv({ cls: "oar-action-section oar-action-primary" });
		primary.createEl("h3", { text: "Add to this research" });
		this.addActionCard(primary, "Add context", "Choose specific files or a folder; the next run remains bounded.", () => this.host.onAttachFiles());
		this.addActionCard(primary, "Open MOC builder", "Create or adjust the map used to navigate your vault.", () => this.host.onOpenMoc());
				this.addActionCard(primary, "Continue research", "Resume from the last bounded run when it paused.", () => this.host.onContinue());

			const ecosystem = this.addDisclosure(contentEl, "Niplex ecosystem", "Run approved read-only actions from connected Niplex extensions.");
			const ecosystemActions = this.host.getEcosystemActions();
			if (!ecosystemActions.length) ecosystem.createEl("small", { text: "No ecosystem actions are enabled. Grant read-only action permission in the core settings." });
			for (const action of ecosystemActions) this.addActionCard(ecosystem, action.label, `${action.extensionId} · ${action.description}`, () => void this.host.onEcosystemAction(action));

			const quick = this.addDisclosure(contentEl, "Quick-action bar", "Choose up to three icons to keep beside the chat input.");
		this.renderQuickActionChooser(quick);

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
		this.addButton(chatActions, "Open history", () => this.host.onOpenChatHistory());
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

			const layout = this.addDisclosure(contentEl, "Chat window size", "Choose how much space the conversation gets on screen.");
			const layoutSelect = layout.createEl("select", { cls: "oar-action-select", attr: { "aria-label": "Chat window size" } });
			layoutSelect.add(new Option("Compact · more room for other Obsidian panes", "compact"));
			layoutSelect.add(new Option("Comfortable · balanced reading space", "comfortable"));
			layoutSelect.add(new Option("Spacious · largest conversation area", "spacious"));
			layoutSelect.value = this.host.settings.windowSize;
			layoutSelect.addEventListener("change", () => {
				const size = layoutSelect.value as WindowSize;
				if (size === "compact" || size === "comfortable" || size === "spacious") void this.host.onWindowSizeChange(size);
			});

			const more = this.addDisclosure(contentEl, "More tools", "View transparent prompts or open redacted diagnostics.");
		this.addActionCard(more, "View prompts", "Read the protected policy and edit only the additive prompt.", () => this.host.onOpenPrompts());
		this.addActionCard(more, "Open user memory", "Review the bounded personalization note before or after an approved update.", () => void this.host.onOpenMemory());
		this.addActionCard(more, "Open logs", "Review local redacted diagnostics.", () => this.host.onOpenLogs());
	}

	private addDisclosure(root: HTMLElement, title: string, description: string): HTMLElement {
		const details = root.createEl("details", { cls: "oar-action-disclosure" });
		const summary = details.createEl("summary");
		summary.createEl("strong", { text: title });
		summary.createEl("small", { text: description });
		return details.createDiv({ cls: "oar-action-disclosure-body" });
	}

	private renderQuickActionChooser(root: HTMLElement): void {
		const note = root.createDiv({ cls: "oar-action-chooser-note", text: `${this.host.settings.quickActions.length} / 3 selected` });
		for (const action of QUICK_ACTIONS) {
			const label = root.createEl("label", { cls: "oar-action-toggle" });
			const checkbox = label.createEl("input", { type: "checkbox" });
			checkbox.checked = this.host.settings.quickActions.includes(action.id);
			checkbox.addEventListener("change", () => {
				const next = this.host.settings.quickActions.filter((id) => id !== action.id);
				if (checkbox.checked) {
					if (next.length >= 3) {
						checkbox.checked = false;
						new Notice("Choose up to three quick actions.");
						return;
					}
					next.push(action.id);
				}
				this.host.settings.quickActions = next;
				note.textContent = `${next.length} / 3 selected`;
				void this.host.onQuickActionsChange(next);
			});
			label.createSpan({ text: `${action.label} · ${action.icon}` });
		}
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
			const subject = chat.subject ?? chat.title;
			if (query && !searchableChatText(subject, chat.messages).includes(query)) continue;
			this.chatSelectEl.add(new Option(subject, chat.id));
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
