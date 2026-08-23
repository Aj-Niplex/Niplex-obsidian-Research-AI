import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import type { AgentEvent, AgentRunResult } from "../core/agent-runtime";
import type { AgentSettings, ChatMessage, ProviderId, ProviderModel, SavedChat } from "../core/types";
import { MocModal, type MocHost } from "./moc-modal";
import { FilePickerModal, type FilePickerHost } from "./file-picker-modal";

export const AGENT_VIEW_TYPE = "obsidian-agentic-research-view";

export interface AgentViewHost extends MocHost, FilePickerHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	runAgent(prompt: string, history: ChatMessage[], emit: (event: AgentEvent) => void, attachedFiles?: string[]): Promise<AgentRunResult>;
	getChats(): SavedChat[];
	getChat(id: string): SavedChat | null;
	getModelCatalogue(provider: ProviderId, forceRefresh?: boolean): Promise<ProviderModel[]>;
	openDiagnostics(): void;
	saveChat(chat: SavedChat): Promise<void>;
	deleteChat(id: string): Promise<void>;
}

function newChat(): SavedChat {
	const now = Date.now();
		return { id: `chat-${now}`, title: "New research chat", createdAt: now, updatedAt: now, provider: "gemini", model: "", messages: [], attachments: [] };
}

export class AgentView extends ItemView {
	private readonly host: AgentViewHost;
	private transcriptEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private runButton!: HTMLButtonElement;
	private continueButton!: HTMLButtonElement;
	private providerSelect!: HTMLSelectElement;
	private modelSelect!: HTMLSelectElement;
	private chatSelect!: HTMLSelectElement;
	private chatSearchEl!: HTMLInputElement;
	private saveChatButton!: HTMLButtonElement;
	private deleteChatButton!: HTMLButtonElement;
	private attachButton!: HTMLButtonElement;
	private attachmentListEl!: HTMLElement;
	private scopeEl!: HTMLElement;
	private busyEl: HTMLElement | null = null;
	private activeStep: HTMLDetailsElement | null = null;
	private currentChat: SavedChat = newChat();
	private currentChatPersisted = false;

	constructor(leaf: WorkspaceLeaf, host: AgentViewHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return AGENT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Agentic research";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl;
		root.empty();
		root.addClass("oar-view");

		const header = root.createDiv({ cls: "oar-header" });
		header.createEl("h2", { text: "Agentic research" });
		header.createEl("p", { text: "Search and read bounded vault context, then create an approved report.", cls: "oar-muted" });
		this.scopeEl = header.createDiv({ cls: "oar-scope" });
		this.refreshScopeText();

		const toolbar = header.createDiv({ cls: "oar-toolbar" });
			this.chatSearchEl = toolbar.createEl("input", { type: "search", placeholder: "Search saved chats…", cls: "oar-chat-search", attr: { "aria-label": "Search saved chats" } });
			this.chatSearchEl.addEventListener("input", () => this.refreshChatOptions());
			this.chatSelect = toolbar.createEl("select", { cls: "oar-chat-select", attr: { "aria-label": "Saved chat" } });
			this.chatSelect.addEventListener("change", () => this.selectChat(this.chatSelect.value));
		const newButton = toolbar.createEl("button", { text: "New chat" });
		newButton.addEventListener("click", () => this.startNewChat());
		this.saveChatButton = toolbar.createEl("button", { text: "Save" });
		this.saveChatButton.addEventListener("click", () => void this.saveCurrentChat());
		this.deleteChatButton = toolbar.createEl("button", { text: "Delete" });
		this.deleteChatButton.addEventListener("click", () => void this.deleteCurrentChat());
			const mocButton = toolbar.createEl("button", { text: "MOC" });
			mocButton.addEventListener("click", () => new MocModal(this.app, this.host, () => this.refreshScopeText()).open());
			const logsButton = toolbar.createEl("button", { text: "Logs" });
			logsButton.addEventListener("click", () => this.host.openDiagnostics());
			toolbar.createEl("label", { text: "Provider" });
			this.providerSelect = toolbar.createEl("select", { cls: "oar-provider-select", attr: { "aria-label": "Provider" } });
			this.providerSelect.add(new Option("Google Gemini", "gemini"));
			this.providerSelect.add(new Option("Agnes AI", "agnes"));
			this.providerSelect.value = this.host.settings.provider;
			this.providerSelect.addEventListener("change", () => void this.changeProvider(this.providerSelect.value as ProviderId));
			toolbar.createEl("label", { text: "Model" });
			this.modelSelect = toolbar.createEl("select", { cls: "oar-model-select", attr: { "aria-label": "Model" } });
			void this.refreshModelOptions();
			this.modelSelect.addEventListener("change", () => void this.changeModel(this.modelSelect.value));
		this.refreshChatOptions();

		this.transcriptEl = root.createDiv({ cls: "oar-transcript" });
		this.renderCurrentChat();

			const composer = root.createDiv({ cls: "oar-composer" });
			this.inputEl = composer.createEl("textarea", {
				attr: { rows: "4", placeholder: "Ask the agent to research your vault…" },
			});
			this.attachmentListEl = composer.createDiv({ cls: "oar-attachment-list" });
			this.attachButton = composer.createEl("button", { text: "Attach files", cls: "oar-attach-button" });
			this.attachButton.addEventListener("click", () => new FilePickerModal(this.app, this.host, this.currentChat.attachments ?? [], (paths) => {
				this.currentChat.attachments = paths;
				this.renderAttachmentChips();
			}).open());
			this.renderAttachmentChips();
				const composerActions = composer.createDiv({ cls: "oar-composer-actions" });
			this.runButton = composerActions.createEl("button", { text: "Run agent", cls: "mod-cta" });
			this.runButton.addEventListener("click", () => void this.submit());
			this.continueButton = composerActions.createEl("button", { text: "Continue bounded research", cls: "oar-continue-button" });
			this.continueButton.disabled = true;
			this.continueButton.addEventListener("click", () => {
				this.inputEl.value = "Continue the research from the existing bounded evidence. Read another relevant file only when needed, then update the answer.";
				void this.submit();
			});
		this.inputEl.addEventListener("keydown", (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
		});
	}

	private refreshScopeText(): void {
		if (!this.scopeEl) return;
		this.scopeEl.textContent = this.host.settings.activeMocPath
			? `Scope: ${this.host.settings.activeMocPath}`
			: "Scope: adaptive vault search; no MOC selected";
	}

	private async refreshModelOptions(forceRefresh = false): Promise<void> {
		if (!this.modelSelect) return;
		const provider = this.host.settings.provider;
		let selected = provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
		let models: ProviderModel[] = [];
		try {
			models = await this.host.getModelCatalogue(provider, forceRefresh);
		} catch {
			models = [];
		}
		const selectedIsLive = models.some((model) => model.id === selected);
		if (models.length && !selectedIsLive) {
			const replacement = models.find((model) => /(?:flash|mini|instant)/i.test(model.id)) ?? models[0];
			if (replacement) {
				const previous = selected;
				selected = replacement.id;
				if (provider === "gemini") this.host.settings.geminiModel = selected;
				else this.host.settings.agnesModel = selected;
				this.currentChat.model = selected;
				void this.host.saveSettings();
				new Notice(`Removed unavailable model ${previous}; using ${selected}.`);
			}
		}
		const entries = models.length ? models : [{ id: selected, label: `${selected} · catalogue unavailable` }];
		this.modelSelect.empty();
		for (const model of entries) this.modelSelect.add(new Option(model.label, model.id));
		this.modelSelect.value = selected;
	}

	private async changeModel(model: string): Promise<void> {
		const value = model.trim();
		if (!value) return;
		if (this.host.settings.provider === "gemini") this.host.settings.geminiModel = value;
		else this.host.settings.agnesModel = value;
		this.currentChat.provider = this.host.settings.provider;
		this.currentChat.model = value;
		await this.host.saveSettings();
		new Notice(`Next agent turn will use ${value}.`);
	}

	private async changeProvider(provider: ProviderId): Promise<void> {
		this.host.settings.provider = provider;
		this.currentChat.provider = provider;
		this.currentChat.model = provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
		await this.host.saveSettings();
		await this.refreshModelOptions();
		new Notice(`Next agent turn will use ${this.currentChat.model}.`);
	}

	private refreshChatOptions(): void {
		if (!this.chatSelect) return;
		this.chatSelect.empty();
			this.chatSelect.add(new Option("Current chat", this.currentChat.id));
			const query = this.chatSearchEl?.value.trim().toLowerCase() ?? "";
			for (const chat of this.host.getChats()) {
				if (chat.id === this.currentChat.id) continue;
				const haystack = `${chat.title}\n${chat.messages.map((message) => message.content).join("\n")}`.toLowerCase();
				if (query && !haystack.includes(query)) continue;
				this.chatSelect.add(new Option(chat.title, chat.id));
			}
		this.chatSelect.value = this.currentChat.id;
		this.deleteChatButton.disabled = !this.currentChatPersisted;
	}

	private selectChat(id: string): void {
		if (!id || id === this.currentChat.id) return;
		const chat = this.host.getChat(id);
		if (!chat) return;
		this.currentChat = chat;
		this.currentChat.attachments = chat.attachments ?? [];
		this.currentChatPersisted = true;
			this.host.settings.provider = chat.provider;
			if (chat.model) {
				if (chat.provider === "gemini") this.host.settings.geminiModel = chat.model;
				else this.host.settings.agnesModel = chat.model;
			}
			this.providerSelect.value = chat.provider;
			void this.host.saveSettings();
			void this.refreshModelOptions();
		this.renderCurrentChat();
		this.renderAttachmentChips();
	}

	private startNewChat(): void {
		this.currentChat = newChat();
		this.currentChat.provider = this.host.settings.provider;
		this.currentChat.model = this.host.settings.provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
			this.currentChatPersisted = false;
			void this.refreshModelOptions();
			this.renderCurrentChat();
		this.refreshChatOptions();
		this.renderAttachmentChips();
	}

	private renderAttachmentChips(): void {
		if (!this.attachmentListEl) return;
		this.attachmentListEl.empty();
		const attachments = this.currentChat.attachments ?? [];
		if (!attachments.length) {
			this.attachmentListEl.createSpan({ text: "No explicit files attached; the agent will use bounded tools and super-MOC context.", cls: "oar-muted" });
			return;
		}
		this.attachmentListEl.createSpan({ text: "Attached for next run:", cls: "oar-attachment-label" });
		for (const path of attachments) {
			const chip = this.attachmentListEl.createSpan({ cls: "oar-attachment-chip" });
			chip.createSpan({ text: path });
			const remove = chip.createEl("button", { text: "×", attr: { "aria-label": `Remove ${path}` } });
			remove.addEventListener("click", () => {
				this.currentChat.attachments = (this.currentChat.attachments ?? []).filter((item) => item !== path);
				this.renderAttachmentChips();
			});
		}
	}

	private renderCurrentChat(): void {
		if (!this.transcriptEl) return;
		this.transcriptEl.empty();
		this.activeStep = null;
		this.appendSystem(this.currentChat.messages.length ? `Loaded “${this.currentChat.title}”.` : "Ready. Start with a focused research question.");
		for (const message of this.currentChat.messages) {
			if (message.role === "user") this.appendUser(message.content);
			else if (message.role === "assistant" && message.content && !message.toolCalls?.length) this.appendAssistant(message.content);
			else if (message.role === "tool") this.appendSavedTool(message);
		}
	}

	private async saveCurrentChat(): Promise<void> {
		const userMessages = this.currentChat.messages.filter((message) => message.role === "user");
		if (userMessages.length === 0) {
			new Notice("Ask at least one question before saving a chat.");
			return;
		}
		this.currentChat.provider = this.host.settings.provider;
		if (!this.currentChat.model) this.currentChat.model = this.host.settings.provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
		await this.host.saveChat(this.currentChat);
		this.currentChatPersisted = true;
		this.refreshChatOptions();
		new Notice("Chat saved for later reference.");
	}

	private async deleteCurrentChat(): Promise<void> {
		if (!this.currentChatPersisted) return;
		await this.host.deleteChat(this.currentChat.id);
		this.startNewChat();
		new Notice("Saved chat deleted.");
	}

	private scrollToBottom(): void {
		this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
	}

	private appendSystem(text: string): void {
		const block = this.transcriptEl.createDiv({ cls: "oar-message oar-system" });
		block.setAttribute("role", "status");
		block.createDiv({ text });
		this.scrollToBottom();
	}

	private appendUser(text: string): void {
		const block = this.transcriptEl.createDiv({ cls: "oar-message oar-user" });
		block.setAttribute("role", "article");
		block.setAttribute("aria-label", "Your message");
		block.createEl("strong", { text: "You" });
		block.createDiv({ text });
		this.scrollToBottom();
	}

	private appendAssistant(text: string): void {
		const block = this.transcriptEl.createDiv({ cls: "oar-message oar-assistant" });
		block.setAttribute("role", "article");
		block.setAttribute("aria-label", "Agent response");
		block.createEl("strong", { text: "Agent" });
		const content = block.createDiv({ cls: "oar-markdown" });
		void MarkdownRenderer.render(this.app, text, content, "", this);
		this.scrollToBottom();
	}

	private appendSavedTool(message: ChatMessage): void {
		const details = this.transcriptEl.createEl("details", { cls: "oar-step" });
		details.createEl("summary", { text: `Previous activity · ${message.toolName ?? "vault tool"}` });
		details.createEl("pre", { text: message.content, cls: "oar-tool-preview" });
	}

	private ensureStep(step: number): HTMLDetailsElement {
		if (this.activeStep?.dataset.step === String(step)) return this.activeStep;
		if (this.activeStep) {
			this.activeStep.open = false;
			this.activeStep.toggleClass("is-running", false);
		}
		const details = this.transcriptEl.createEl("details", { cls: "oar-step is-running" });
		details.dataset.step = String(step);
		const summary = details.createEl("summary", { cls: "oar-step-summary", text: `Step ${step}` });
		summary.setAttribute("aria-live", "polite");
		const body = details.createDiv({ cls: "oar-step-body" });
		body.createDiv({ cls: "oar-step-placeholder", text: "Working…" });
		this.activeStep = details;
		this.scrollToBottom();
		return details;
	}

	private setStepSummary(step: number, label: string, running: boolean): HTMLDetailsElement {
		const details = this.ensureStep(step);
		const summary = details.querySelector("summary");
		if (summary) summary.textContent = `Step ${step} · ${label}`;
		details.toggleClass("is-running", running);
		return details;
	}

	private stepBody(details: HTMLDetailsElement): HTMLElement {
		return details.querySelector<HTMLElement>(".oar-step-body") ?? details.createDiv({ cls: "oar-step-body" });
	}

	private appendToolEvent(event: AgentEvent): void {
		const details = this.setStepSummary(event.step ?? 0, `Using ${event.tool?.name ?? "vault tool"}`, false);
		const body = this.stepBody(details);
		body.empty();
		body.createEl("small", { text: "Bounded result preview" });
		const preview = body.createEl("pre", { cls: "oar-tool-preview" });
		preview.textContent = event.message.length > 1400 ? `${event.message.slice(0, 1400)}\n…[preview collapsed]` : event.message;
		details.open = false;
		this.scrollToBottom();
	}

	private appendEvent(event: AgentEvent): void {
		if (event.type === "status" && event.phase === "thinking") {
			this.busyEl?.remove();
			this.busyEl = null;
			this.setStepSummary(event.step ?? 0, event.message, true).open = true;
			return;
		}
		if (event.type === "tool") {
			this.appendToolEvent(event);
			return;
		}
		if (event.type === "text") {
			if (event.final) {
				if (this.activeStep) {
					this.activeStep.toggleClass("is-running", false);
					this.activeStep.open = false;
				}
				this.appendAssistant(event.message);
			} else {
				const details = this.setStepSummary(event.step ?? 0, "Agent update", true);
				const body = this.stepBody(details);
				body.empty();
				const content = body.createDiv({ cls: "oar-markdown oar-step-update" });
				void MarkdownRenderer.render(this.app, event.message, content, "", this);
				this.scrollToBottom();
			}
			return;
		}
		if (event.type === "status" && event.phase === "complete") {
			if (this.activeStep) {
				this.activeStep.toggleClass("is-running", false);
				this.activeStep.open = false;
			}
			return;
		}
		if (event.type === "error") {
			this.busyEl?.remove();
			this.busyEl = null;
			const block = this.transcriptEl.createDiv({ cls: "oar-message oar-error" });
			block.createEl("strong", { text: "Agent error" });
			block.createDiv({ text: event.message });
			this.scrollToBottom();
		}
	}

	private showImmediateBusy(): void {
		this.busyEl = this.transcriptEl.createDiv({ cls: "oar-busy" });
		this.busyEl.setAttribute("role", "status");
		this.busyEl.setAttribute("aria-live", "polite");
		this.busyEl.createSpan({ cls: "oar-spinner", attr: { "aria-hidden": "true" } });
		this.busyEl.createSpan({ text: "Starting agent…" });
		this.scrollToBottom();
	}

	private async submit(): Promise<void> {
		const prompt = this.inputEl.value.trim();
		if (!prompt || this.runButton.disabled) return;
		this.inputEl.value = "";
		const history = this.currentChat.messages.slice();
		const attachments = [...(this.currentChat.attachments ?? [])];
		this.appendUser(prompt);
		this.currentChat.messages.push({ role: "user", content: prompt });
		if (this.currentChat.messages.filter((message) => message.role === "user").length === 1) {
			this.currentChat.title = prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt;
		}
		this.showImmediateBusy();
		this.runButton.disabled = true;
		this.continueButton.disabled = true;
		this.inputEl.disabled = true;
		this.runButton.textContent = "Working…";
		try {
				const result = await this.host.runAgent(prompt, history, (event) => this.appendEvent(event), attachments);
					this.currentChat.model = result.model;
					this.currentChat.attachments = attachments;
				this.continueButton.disabled = !result.stopped;
				this.currentChat.messages = result.messages.filter((message) => message.role !== "system");
			if (this.currentChatPersisted) await this.host.saveChat(this.currentChat);
		} catch (error) {
			this.continueButton.disabled = true;
			this.appendEvent({ type: "error", phase: "error", message: error instanceof Error ? error.message : "Agent run failed." });
		} finally {
			this.busyEl?.remove();
			this.busyEl = null;
			this.runButton.disabled = false;
			this.inputEl.disabled = false;
			this.runButton.textContent = "Run agent";
				void this.refreshModelOptions();
			this.refreshChatOptions();
		}
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}
}
