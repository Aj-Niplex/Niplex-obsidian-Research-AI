import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import type { AgentEvent, AgentRunResult } from "../core/agent-runtime";
import type { AgentSettings, ChatMessage, ProviderId, ProviderModel, SavedChat } from "../core/types";
import { MocModal, type MocHost } from "./moc-modal";
import { FilePickerModal, type FilePickerHost } from "./file-picker-modal";
import { ActionSheetModal, type ActionSheetHost } from "./action-sheet-modal";

export const AGENT_VIEW_TYPE = "obsidian-agentic-research-view";

export interface AgentViewHost extends MocHost, FilePickerHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	runAgent(prompt: string, history: ChatMessage[], emit: (event: AgentEvent) => void, attachedFiles?: string[]): Promise<AgentRunResult>;
	getChats(): SavedChat[];
	getChat(id: string): SavedChat | null;
	getModelCatalogue(provider: ProviderId, forceRefresh?: boolean): Promise<ProviderModel[]>;
	openDiagnostics(): void;
	openPrompts(): void;
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

			const toolbar = header.createDiv({ cls: "oar-toolbar oar-toolbar-compact" });
			const actionsButton = toolbar.createEl("button", { text: "Research actions", cls: "oar-actions-button" });
			actionsButton.addEventListener("click", () => this.openActionSheet());

		this.transcriptEl = root.createDiv({ cls: "oar-transcript" });
		this.renderCurrentChat();

			const composer = root.createDiv({ cls: "oar-composer" });
			composer.createDiv({ cls: "oar-composer-hint", text: "Ask one focused question. Add context only when you need it." });
			this.inputEl = composer.createEl("textarea", {
				attr: { rows: "4", placeholder: "Ask the agent to research your vault…" },
			});
			this.attachmentListEl = composer.createDiv({ cls: "oar-attachment-list" });
			this.attachButton = composer.createEl("button", { text: "Attach files", cls: "oar-attach-button" });
			this.attachButton.addEventListener("click", () => this.openFilePicker());
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
		new Notice(`Next agent turn will use ${this.currentChat.model}.`);
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
				void this.host.saveSettings();
		this.renderCurrentChat();
		this.renderAttachmentChips();
	}

	private startNewChat(): void {
		this.currentChat = newChat();
		this.currentChat.provider = this.host.settings.provider;
		this.currentChat.model = this.host.settings.provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
			this.currentChatPersisted = false;
			this.renderCurrentChat();
		this.renderAttachmentChips();
	}

	private openFilePicker(): void {
		new FilePickerModal(this.app, this.host, this.currentChat.attachments ?? [], (paths) => {
			this.currentChat.attachments = paths;
			this.renderAttachmentChips();
		}).open();
	}

	private openActionSheet(): void {
		const sheetHost: ActionSheetHost = {
			settings: this.host.settings,
			currentChat: this.currentChat,
			currentChatPersisted: this.currentChatPersisted,
			getChats: () => this.host.getChats(),
			getChat: (id) => this.host.getChat(id),
			getModelCatalogue: (provider, forceRefresh) => this.host.getModelCatalogue(provider, forceRefresh),
			onNewChat: () => this.startNewChat(),
			onSaveChat: () => this.saveCurrentChat(),
			onDeleteChat: () => this.deleteCurrentChat(),
			onSelectChat: (id) => this.selectChat(id),
			onAttachFiles: () => this.openFilePicker(),
			onOpenMoc: () => new MocModal(this.app, this.host, () => this.refreshScopeText()).open(),
			onContinue: () => {
				this.inputEl.value = "Continue the research from the existing bounded evidence. Read another relevant file only when needed, then update the answer.";
				void this.submit();
			},
			onProviderChange: (provider) => this.changeProvider(provider),
			onModelChange: (model) => this.changeModel(model),
			onOpenLogs: () => this.host.openDiagnostics(),
			onOpenPrompts: () => this.host.openPrompts(),
		};
		new ActionSheetModal(this.app, sheetHost).open();
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
		}
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}
}
