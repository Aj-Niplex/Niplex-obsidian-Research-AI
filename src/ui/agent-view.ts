import { ItemView, MarkdownRenderer, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type { AgentEvent, AgentRunResult } from "../core/agent-runtime";
import type { AgentSettings, ChatMessage, InstalledSkill, ProviderId, ProviderModel, QuickActionId, SavedChat } from "../core/types";
import { CONTEXT_BUDGETS } from "../core/context-budget";
import { compactChatMessages } from "../core/chat-history";
import { deriveChatSubject } from "../core/chat-subject";
import { MocModal, type MocHost } from "./moc-modal";
import { FilePickerModal, type FilePickerHost } from "./file-picker-modal";
import { ActionSheetModal, type ActionSheetHost } from "./action-sheet-modal";
import { AttachmentChoiceModal } from "./attachment-choice-modal";
import type { AttachmentMode } from "./file-picker-modal";
import { ChatHistoryModal } from "./chat-history-modal";
import { SkillSelectorModal, type SkillSelection } from "./skill-selector-modal";

export const AGENT_VIEW_TYPE = "niplex-agentic-research-view";
export const LEGACY_AGENT_VIEW_TYPE = "obsidian-agentic-research-view";

export interface AgentViewHost extends MocHost, FilePickerHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	runAgent(prompt: string, history: ChatMessage[], emit: (event: AgentEvent) => void, attachedFiles?: string[], conversationSubject?: string, recentSubjects?: string[], selectedSkillCodes?: string[], signal?: AbortSignal): Promise<AgentRunResult>;
	getChats(): SavedChat[];
	getChat(id: string): SavedChat | null;
	getModelCatalogue(provider: ProviderId, forceRefresh?: boolean): Promise<ProviderModel[]>;
	openDiagnostics(): void;
	openPrompts(): void;
	openMemoryFile(): Promise<void>;
	saveChat(chat: SavedChat): Promise<void>;
	deleteChat(id: string): Promise<void>;
	getInstalledSkills(): Promise<InstalledSkill[]>;
}

function newChat(): SavedChat {
	const now = Date.now();
	return {
		id: `chat-${now}`,
		title: "New research chat",
		subject: "New research chat",
		createdAt: now,
		updatedAt: now,
		provider: "gemini",
		model: "",
		messages: [],
		attachments: [],
		skillCodes: [],
	};
}

export class AgentView extends ItemView {
	private readonly host: AgentViewHost;
	private transcriptEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private runButton!: HTMLButtonElement;
	private continueButton!: HTMLButtonElement;
	private attachButton!: HTMLButtonElement;
	private attachmentListEl!: HTMLElement;
	private quickBarEl!: HTMLElement;
	private modelSelectEl!: HTMLSelectElement;
	private modeSelectEl!: HTMLSelectElement;
	private busyEl: HTMLElement | null = null;
	private activeStep: HTMLDetailsElement | null = null;
	private currentChat: SavedChat = newChat();
	private currentChatPersisted = false;
	private lastPrompt = "";
	private lastRunErrorText = "";
	private lastErrorEl: HTMLElement | null = null;
	private requestInFlight = false;
	private runStartedAt = 0;
	private liveStatusEl: HTMLElement | null = null;
	private runActivityLabels: string[] = [];
	private finalAnswerRendered = false;
	private activeAbortController: AbortController | null = null;
	private skillSelectionEl!: HTMLElement;
	private selectedSkillCodes: string[] = [];

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
		const headerRow = header.createDiv({ cls: "oar-header-row" });
		headerRow.createEl("h2", { text: "Agentic research" });
		const actionsButton = headerRow.createEl("button", {
			text: "Actions",
			cls: "oar-actions-button",
			attr: { "aria-label": "Open research actions", type: "button" },
		});
		actionsButton.addEventListener("click", () => this.openActionSheet());
		header.createEl("p", {
			text: "Search bounded context, chat, or create an approved change.",
			cls: "oar-muted",
		});
		this.quickBarEl = header.createDiv({ cls: "oar-quick-bar" });
		this.renderQuickBar();

		this.liveStatusEl = root.createDiv({ cls: "oar-live-status", attr: { role: "status", "aria-live": "polite" } });
		this.liveStatusEl.createSpan({ cls: "oar-live-status-text", text: "Ready for your next question." });
		this.transcriptEl = root.createDiv({ cls: "oar-transcript" });
		this.renderCurrentChat();

		const composer = root.createDiv({ cls: "oar-composer" });
					composer.createDiv({
				cls: "oar-composer-hint",
				text: "Ask one focused question. Use @path/to/note.md for context or type /skill to choose skills and answer size.",
			});
			this.skillSelectionEl = composer.createDiv({ cls: "oar-skill-selection" });
			this.renderSkillSelection();
			const composerEntry = composer.createDiv({ cls: "oar-composer-entry" });
		this.inputEl = composerEntry.createEl("textarea", {
			attr: {
				rows: "4",
				maxlength: String(CONTEXT_BUDGETS.maxUserPromptChars),
				placeholder: "Ask the agent to research your vault…",
				"aria-label": "Research question",
			},
		});
		const composerSide = composerEntry.createDiv({ cls: "oar-composer-side" });
		this.attachButton = composerSide.createEl("button", {
			cls: "oar-attach-button",
			attr: { "aria-label": "Add files or folder", title: "Add files or folder", type: "button" },
		});
		setIcon(this.attachButton, "plus");
		this.attachButton.addEventListener("click", () => this.openAttachmentChoice());
		this.runButton = composerSide.createEl("button", {
			cls: "mod-cta oar-run-button",
			attr: { "aria-label": "Run agent", title: "Run agent", type: "button" },
		});
		setIcon(this.runButton, "arrow-up");
		this.runButton.addEventListener("click", () => {
			if (this.requestInFlight) this.stopRun();
			else void this.submit();
		});

		const queryCounter = composer.createDiv({ cls: "oar-query-counter", attr: { "aria-live": "polite" } });
		const updateQueryCounter = () => {
			queryCounter.textContent = `${this.inputEl.value.length.toLocaleString()} / ${CONTEXT_BUDGETS.maxUserPromptChars.toLocaleString()} characters`;
		};
			this.inputEl.addEventListener("input", updateQueryCounter);
			this.inputEl.addEventListener("input", () => {
				if (this.inputEl.value.trim().toLowerCase() === "/skill") {
					this.inputEl.value = "";
					updateQueryCounter();
					void this.openSkillSelector();
				}
			});
			updateQueryCounter();

		this.attachmentListEl = composer.createDiv({ cls: "oar-attachment-list" });
		this.renderAttachmentChips();
		const composerActions = composer.createDiv({ cls: "oar-composer-actions" });
		this.continueButton = composerActions.createEl("button", {
			text: "Continue bounded research",
			cls: "oar-continue-button",
			attr: { type: "button" },
		});
		this.continueButton.disabled = true;
		this.continueButton.addEventListener("click", () => {
			this.inputEl.value = "Continue the research from the existing bounded evidence. Read another relevant file only when needed, then update the answer.";
			this.inputEl.dispatchEvent(new Event("input"));
			void this.submit();
		});
		const mocButton = composerActions.createEl("button", {
			cls: "oar-chat-moc-button",
			attr: { "aria-label": "Create or adjust maps of content", title: "Create or adjust maps of content", type: "button" },
		});
		setIcon(mocButton, "map");
		mocButton.createSpan({ text: "MOC builder" });
		mocButton.addEventListener("click", () => new MocModal(this.app, this.host, () => undefined).open());
		this.inputEl.addEventListener("keydown", (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
		});
	}

	private renderQuickBar(): void {
		if (!this.quickBarEl) return;
		this.quickBarEl.empty();
		const quickButtons = this.quickBarEl.createDiv({ cls: "oar-quick-buttons" });
		const labels: Record<QuickActionId, { label: string; icon: string; fallback: string }> = {
			attach: { label: "Add files or folder", icon: "paperclip", fallback: "+" },
			moc: { label: "Open MOC builder", icon: "map", fallback: "⌖" },
			continue: { label: "Continue research", icon: "rotate-ccw", fallback: "↻" },
			history: { label: "Open saved chat history", icon: "history", fallback: "↶" },
			prompts: { label: "View prompts", icon: "scroll-text", fallback: "▤" },
			logs: { label: "Open logs", icon: "activity", fallback: "≋" },
		};
		for (const action of this.host.settings.quickActions.slice(0, 3)) {
			const definition = labels[action];
			if (!definition) continue;
			const button = quickButtons.createEl("button", {
				cls: "oar-quick-button",
				attr: { "aria-label": definition.label, title: definition.label, type: "button" },
			});
			setIcon(button, definition.icon);
			const fallback = button.createSpan({ cls: "oar-quick-fallback", text: definition.fallback, attr: { "aria-hidden": "true" } });
			if (button.querySelector("svg > *")) fallback.addClass("is-hidden");
			button.addEventListener("click", () => void this.runQuickAction(action));
		}

		const controls = this.quickBarEl.createDiv({ cls: "oar-quick-controls" });
		this.modelSelectEl = controls.createEl("select", {
			cls: "oar-model-picker",
			attr: { "aria-label": "Change model", title: "Change model" },
		});
		this.modelSelectEl.addEventListener("change", () => void this.changeModel(this.modelSelectEl.value));
		this.modeSelectEl = controls.createEl("select", {
			cls: "oar-mode-picker",
			attr: { "aria-label": "Research mode", title: "Research mode" },
		});
		this.modeSelectEl.add(new Option("Plan", "plan"));
		this.modeSelectEl.add(new Option("Chat", "chat"));
		this.modeSelectEl.add(new Option("Create & edit", "edit"));
		this.modeSelectEl.value = this.host.settings.researchMode;
		this.modeSelectEl.addEventListener("change", () => void this.changeResearchMode(this.modeSelectEl.value as AgentSettings["researchMode"]));
		void this.refreshModelPicker();
	}

	private renderSkillSelection(): void {
		if (!this.skillSelectionEl) return;
		this.skillSelectionEl.empty();
		const selected = this.selectedSkillCodes.length ? this.selectedSkillCodes.join(", ") : "None";
		const button = this.skillSelectionEl.createEl("button", { text: `Skills: ${selected}`, cls: "oar-skill-selection-button", attr: { type: "button", "aria-label": "Choose skills and answer size" } });
		button.addEventListener("click", () => void this.openSkillSelector());
	}

	private async openSkillSelector(): Promise<void> {
		new SkillSelectorModal(this.app, { settings: this.host.settings, getInstalledSkills: () => this.host.getInstalledSkills() }, this.selectedSkillCodes, (selection: SkillSelection) => {
			this.selectedSkillCodes = [...new Set(selection.codes)].slice(0, 8);
			this.currentChat.skillCodes = [...this.selectedSkillCodes];
			this.host.settings.outputSize = selection.outputSize;
			this.renderSkillSelection();
			void this.host.saveSettings();
			if (this.currentChat.messages.length) void this.host.saveChat(this.currentChat);
		}).open();
	}

	private stopRun(): void {
		if (!this.requestInFlight || !this.activeAbortController) return;
		this.activeAbortController.abort();
		this.setLiveStatus("Stopping the run…");

		const busyText = this.busyEl?.querySelector<HTMLElement>(".oar-busy-text");
		if (busyText) busyText.textContent = "Stopping after the current safe operation…";
	}

	private resolveInlineAttachments(prompt: string): { prompt: string; attachments: string[] } {
		const mentions = [...prompt.matchAll(/(?:^|\s)@([^\s,;]+)/g)].map((match) => match[1]?.replace(/[)\]}>,.!?]+$/, "") ?? "").filter(Boolean);
		if (!mentions.length) return { prompt, attachments: [] };
		const resolved: string[] = [];
		for (const mention of mentions) {
			const exactFile = this.host.searchMarkdownPaths(mention, 120).find((path) => path.toLowerCase() === mention.toLowerCase());
			if (exactFile) {
				resolved.push(exactFile);
				continue;
			}
			const folder = this.host.getMarkdownFolders(120).find((path) => path.toLowerCase() === mention.replace(/\/$/, "").toLowerCase());
			if (folder) resolved.push(...this.host.getMarkdownFilesInFolder(folder, 8));
		}
		return { prompt, attachments: [...new Set(resolved)].slice(0, 8) };
	}

	private async runQuickAction(action: QuickActionId): Promise<void> {
		if (action === "history") {
			this.openChatHistory();
		} else if (action === "attach") {
			this.openAttachmentChoice();
		} else if (action === "moc") {
			new MocModal(this.app, this.host, () => undefined).open();
		} else if (action === "continue") {
			this.inputEl.value = "Continue the research from the existing bounded evidence. Read another relevant file only when needed, then update the answer.";
			this.inputEl.dispatchEvent(new Event("input"));
			await this.submit();
		} else if (action === "prompts") {
			this.host.openPrompts();
		} else if (action === "logs") {
			this.host.openDiagnostics();
		}
	}

	private openChatHistory(): void {
		new ChatHistoryModal(this.app, {
			getChats: () => this.host.getChats(),
			onSelectChat: (id) => this.selectChat(id),
			deleteChat: (id) => this.host.deleteChat(id),
		}).open();
	}

	private async refreshModelPicker(): Promise<void> {
		if (!this.modelSelectEl) return;
		const provider = this.host.settings.provider;
		const selected = provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
		let models: ProviderModel[] = [];
		try {
			models = await this.host.getModelCatalogue(provider);
		} catch {
			models = [];
		}
		if (!this.modelSelectEl || this.host.settings.provider !== provider) return;
		this.modelSelectEl.empty();
		for (const model of models.length ? models : [{ id: selected, label: selected }]) {
			this.modelSelectEl.add(new Option(model.label, model.id));
		}
		this.modelSelectEl.value = selected;
	}

	private async changeResearchMode(mode: AgentSettings["researchMode"]): Promise<void> {
		if (mode !== "plan" && mode !== "chat" && mode !== "edit") return;
		this.host.settings.researchMode = mode;
		await this.host.saveSettings();
		new Notice(`${mode === "plan" ? "Plan" : mode === "edit" ? "Create & edit" : "Chat"} mode selected.`);
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
		this.renderQuickBar();
		new Notice(`Next agent turn will use ${this.currentChat.model}.`);
	}

	private selectChat(id: string): void {
		if (!id || id === this.currentChat.id) return;
		const chat = this.host.getChat(id);
		if (!chat) return;
			this.currentChat = { ...chat, attachments: [...(chat.attachments ?? [])], skillCodes: [...(chat.skillCodes ?? [])], messages: [...chat.messages] };
			this.selectedSkillCodes = [...(chat.skillCodes ?? [])];
			this.runActivityLabels = [];
		this.finalAnswerRendered = false;
		this.currentChatPersisted = true;
		this.host.settings.provider = chat.provider;
		if (chat.model) {
			if (chat.provider === "gemini") this.host.settings.geminiModel = chat.model;
			else this.host.settings.agnesModel = chat.model;
		}
		void this.host.saveSettings();
		this.renderCurrentChat();
		this.renderAttachmentChips();
		this.renderQuickBar();
	}

	private startNewChat(): void {
			this.currentChat = newChat();
			this.selectedSkillCodes = [];
			this.runActivityLabels = [];
		this.finalAnswerRendered = false;
		this.setLiveStatus("Ready for your next question.");
		this.currentChat.provider = this.host.settings.provider;
		this.currentChat.model = this.host.settings.provider === "gemini" ? this.host.settings.geminiModel : this.host.settings.agnesModel;
		this.currentChatPersisted = false;
		this.lastPrompt = "";
		this.lastRunErrorText = "";
		this.lastErrorEl = null;
			this.renderCurrentChat();
			this.renderAttachmentChips();
			this.renderSkillSelection();
			this.renderQuickBar();
		}

		private openAttachmentChoice(): void {
		new AttachmentChoiceModal(this.app, () => this.openFilePicker("files"), () => this.openFilePicker("folder")).open();
	}

	private openFilePicker(mode: AttachmentMode): void {
		new FilePickerModal(
			this.app,
			this.host,
			this.currentChat.attachments ?? [],
			(paths) => {
				this.currentChat.attachments = paths;
				this.renderAttachmentChips();
				if (this.currentChat.messages.length) {
					this.currentChatPersisted = true;
					void this.host.saveChat(this.currentChat);
				}
			},
			mode,
		).open();
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
			onOpenChatHistory: () => this.openChatHistory(),
			onAttachFiles: () => this.openAttachmentChoice(),
			onOpenMoc: () => new MocModal(this.app, this.host, () => undefined).open(),
			onContinue: () => {
				this.inputEl.value = "Continue the research from the existing bounded evidence. Read another relevant file only when needed, then update the answer.";
				this.inputEl.dispatchEvent(new Event("input"));
				void this.submit();
			},
			onProviderChange: (provider) => this.changeProvider(provider),
			onModelChange: (model) => this.changeModel(model),
			onQuickActionsChange: async (actions) => {
				this.host.settings.quickActions = actions.slice(0, 3);
				await this.host.saveSettings();
				this.renderQuickBar();
			},
			onOpenLogs: () => this.host.openDiagnostics(),
			onOpenPrompts: () => this.host.openPrompts(),
			onOpenMemory: () => this.host.openMemoryFile(),
		};
		new ActionSheetModal(this.app, sheetHost).open();
	}

	private renderAttachmentChips(): void {
		if (!this.attachmentListEl) return;
		this.attachmentListEl.empty();
		const attachments = this.currentChat.attachments ?? [];
		if (!attachments.length) {
			this.attachmentListEl.createSpan({ text: "No files attached · bounded vault context only", cls: "oar-muted" });
			return;
		}
		this.attachmentListEl.createSpan({ text: "Attached for next run:", cls: "oar-attachment-label" });
		for (const path of attachments) {
			const chip = this.attachmentListEl.createSpan({ cls: "oar-attachment-chip" });
			chip.createSpan({ text: path });
			const remove = chip.createEl("button", {
				text: "×",
				attr: { "aria-label": `Remove ${path}`, type: "button" },
			});
			remove.addEventListener("click", () => {
				this.currentChat.attachments = (this.currentChat.attachments ?? []).filter((item) => item !== path);
				this.renderAttachmentChips();
				if (this.currentChat.messages.length) void this.host.saveChat(this.currentChat);
			});
		}
	}

	private renderCurrentChat(): void {
		if (!this.transcriptEl) return;
		this.transcriptEl.empty();
		this.activeStep = null;
		this.busyEl = null;
		this.runActivityLabels = [...(this.currentChat.activity ?? [])];
		this.finalAnswerRendered = this.currentChat.messages.some((message) => message.role === "assistant" && Boolean(message.content));
		const subject = this.currentChat.subject ?? this.currentChat.title;
		const loadedMessage = this.currentChat.messages.length ? `Loaded “${subject}”.` : "Ready. Start with a focused research question.";
		this.setLiveStatus(loadedMessage);
		this.appendSystem(loadedMessage);
		for (const message of this.currentChat.messages) {
			if (message.role === "user") this.appendUser(message.content);
			else if (message.role === "assistant" && message.content && !message.toolCalls?.length) this.appendAssistant(message.content);
			else if (message.role === "tool") this.appendSavedTool(message);
		}
		if (this.runActivityLabels.length) this.appendActivitySummary();
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

	private setLiveStatus(text: string): void {
		if (!this.liveStatusEl) return;
		const textEl = this.liveStatusEl.querySelector<HTMLElement>(".oar-live-status-text") ?? this.liveStatusEl;
		textEl.textContent = text;
	}

	private trackActivity(label: string): void {
		if (!label || this.runActivityLabels.at(-1) === label) return;
		this.runActivityLabels.push(label);
		if (this.runActivityLabels.length > 24) this.runActivityLabels.shift();
	}

	private appendActivitySummary(): void {
		if (!this.runActivityLabels.length) return;
		const details = this.transcriptEl.createEl("details", { cls: "oar-activity-summary" });
		details.createEl("summary", { text: `Runtime · ${this.runActivityLabels.length} steps` });
		const list = details.createEl("ul");
		for (const label of this.runActivityLabels) list.createEl("li", { text: label });
	}

	private summarizeToolActivity(event: AgentEvent): string {
		const name = event.tool?.name ?? "vault tool";
		const args = event.tool?.arguments ?? {};
		if (name === "read_file_chunk" && typeof args.path === "string") {
			const start = typeof args.startLine === "number" ? Math.max(1, Math.floor(args.startLine)) : 1;
			const lines = typeof args.maxLines === "number" ? Math.max(1, Math.floor(args.maxLines)) : undefined;
			return `Read ${args.path}${lines ? ` · lines ${start}–${start + lines - 1}` : ` · from line ${start}`}`;
		}
		if (name === "search_vault" && typeof args.query === "string") return `Searched the vault for “${args.query.slice(0, 80)}”`;
		if (name === "list_files" && typeof args.query === "string") return `Listed notes matching “${args.query.slice(0, 80)}”`;
		if (name === "read_user_memory") return "Checked user memory because it was relevant";
		if (name === "update_user_memory") return "Prepared a user-memory update for approval";
		if (name === "create_note" && typeof args.path === "string") return `Prepared a new note at ${args.path}`;
		if (name === "append_note" && typeof args.path === "string") return `Prepared an addition to ${args.path}`;
		return `Used ${name}`;
	}

	private appendToolEvent(event: AgentEvent): void {
		const toolName = event.tool?.name ?? "vault tool";
		const activity = this.summarizeToolActivity(event);
		this.trackActivity(activity);
		this.setLiveStatus(`Agent used ${toolName} and is checking the bounded result…`);
		const details = this.setStepSummary(event.step ?? 0, activity, false);
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
			this.setLiveStatus(event.message);
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
				this.trackActivity("Prepared the final answer");
				this.appendActivitySummary();
				this.finalAnswerRendered = true;
				this.setLiveStatus("Answer ready.");
			} else {
				this.trackActivity("Prepared the next bounded action");
				this.setLiveStatus("Preparing the next bounded action…");
				const details = this.setStepSummary(event.step ?? 0, "Preparing the next bounded action", true);
				const body = this.stepBody(details);
				body.empty();
				body.createDiv({ cls: "oar-step-update", text: "The agent is selecting the next safe action. Detailed private reasoning is not displayed or saved." });
				this.scrollToBottom();
			}
			return;
		}
		if (event.type === "status" && event.phase === "complete") {
			if (this.activeStep) {
				this.activeStep.toggleClass("is-running", false);
				this.activeStep.open = false;
			}
			if (!this.finalAnswerRendered) this.setLiveStatus("Finishing the answer…");
			return;
		}
		if (event.type === "error") {
			this.lastRunErrorText = event.message;
			this.setLiveStatus("Provider response received; preparing the recovery message…");
			const busyText = this.busyEl?.querySelector<HTMLElement>(".oar-busy-text");
			if (busyText) busyText.textContent = "The request ended with an error. Preparing the recovery action…";
			if (this.activeStep) {
				this.activeStep.toggleClass("is-running", false);
				this.activeStep.open = false;
			}
			this.lastErrorEl?.remove();
			const block = this.transcriptEl.createDiv({ cls: "oar-message oar-error" });
			this.lastErrorEl = block;
			block.createEl("strong", { text: "Agent could not finish" });
			block.createDiv({ text: event.message });
			if (this.lastPrompt) {
				const retry = block.createEl("button", {
					text: "Retry request",
					cls: "mod-cta",
					attr: { type: "button" },
				});
				retry.addEventListener("click", () => this.retryLastRun());
			}
			this.scrollToBottom();
		}
	}

	private showImmediateBusy(): void {
		this.setLiveStatus("Agent is working…");
		this.busyEl?.remove();
		this.busyEl = this.transcriptEl.createDiv({ cls: "oar-busy" });
		this.busyEl.setAttribute("role", "status");
		this.busyEl.setAttribute("aria-live", "polite");
		this.busyEl.createSpan({ cls: "oar-spinner", attr: { "aria-hidden": "true" } });
		this.busyEl.createSpan({ cls: "oar-busy-text", text: "Connecting to the selected model… live recovery status will appear here." });
		this.scrollToBottom();
	}

	private setSubmitting(submitting: boolean): void {
		this.requestInFlight = submitting;
		this.liveStatusEl?.toggleClass("is-running", submitting);
		this.liveStatusEl?.setAttribute("aria-busy", submitting ? "true" : "false");
		this.runButton.disabled = false;
		this.runButton.toggleClass("is-stop", submitting);
		this.runButton.setAttribute("aria-label", submitting ? "Stop run" : "Run agent");
		this.runButton.setAttribute("title", submitting ? "Stop run" : "Run agent");
		this.continueButton.disabled = submitting || this.continueButton.disabled;
		this.inputEl.disabled = submitting;
		this.attachButton.disabled = submitting;
		if (submitting) {
			this.runButton.empty();
			setIcon(this.runButton, "square");
		} else {
			this.runButton.empty();
			setIcon(this.runButton, "arrow-up");
		}
	}

	private async submit(): Promise<void> {
			const prompt = this.inputEl.value.trim();
			if (!prompt || this.requestInFlight) return;
			const inline = this.resolveInlineAttachments(prompt);
			const attachments = [...new Set([...(this.currentChat.attachments ?? []), ...inline.attachments])].slice(0, 8);
			if (inline.attachments.length) {
				this.currentChat.attachments = attachments;
				this.renderAttachmentChips();
			}
			this.lastPrompt = prompt;
		this.lastRunErrorText = "";
		this.lastErrorEl?.remove();
		this.lastErrorEl = null;
		this.inputEl.value = "";
		this.inputEl.dispatchEvent(new Event("input"));
					const history = compactChatMessages(this.currentChat.messages);
			const previousSubject = this.currentChat.subject ?? this.currentChat.title;
		this.appendUser(prompt);
		this.currentChat.messages.push({ role: "user", content: prompt });
		const subject = deriveChatSubject(prompt, previousSubject);
		this.currentChat.title = subject;
			this.currentChat.subject = subject;
			this.currentChat.skillCodes = [...this.selectedSkillCodes];
			this.runActivityLabels = ["Sent a bounded request"];
			const controller = new AbortController();
			this.activeAbortController = controller;
			this.finalAnswerRendered = false;
		this.runStartedAt = Date.now();
		this.currentChatPersisted = true;
		this.showImmediateBusy();
		this.setSubmitting(true);
		try {
			await this.host.saveChat(this.currentChat);
			const recentSubjects = this.host.getChats().map((chat) => chat.subject ?? chat.title).filter((value) => value && value !== subject).slice(-6);
				const result = await this.host.runAgent(prompt, history, (event) => this.appendEvent(event), attachments, subject, recentSubjects, this.selectedSkillCodes, controller.signal);
				this.currentChat.model = result.model;
				this.currentChat.attachments = attachments;
				this.currentChat.skillCodes = [...this.selectedSkillCodes];
				if (result.stopped && !this.finalAnswerRendered) {
					this.appendAssistant(result.text);
					this.trackActivity("Run stopped by user");
					this.appendActivitySummary();
					this.finalAnswerRendered = true;
					this.setLiveStatus("Run stopped.");
				}
				this.continueButton.disabled = !result.stopped;
			if (result.subject) {
				this.currentChat.title = result.subject;
				this.currentChat.subject = result.subject;
			}
			this.currentChat.messages = compactChatMessages([...history, { role: "user", content: prompt }, { role: "assistant", content: result.text }]);
			this.currentChat.activity = [...this.runActivityLabels];
			await this.host.saveChat(this.currentChat);
		} catch (error) {
			this.continueButton.disabled = true;
			const message = error instanceof Error ? error.message : "Agent run failed.";
			this.appendEvent({ type: "error", phase: "error", message });
			this.currentChat.messages = compactChatMessages([...this.currentChat.messages, { role: "assistant", content: message }]);
			this.currentChat.activity = [...this.runActivityLabels];
			this.currentChatPersisted = true;
			try {
				await this.host.saveChat(this.currentChat);
			} catch {
				// Keep the visible error even if the vault is temporarily unavailable.
			}
					} finally {
				this.activeAbortController = null;
				const remainingStatusMs = Math.max(0, 650 - (Date.now() - this.runStartedAt));
			if (remainingStatusMs) await new Promise<void>((resolve) => window.setTimeout(resolve, remainingStatusMs));
			this.busyEl?.remove();
			this.busyEl = null;
			this.setSubmitting(false);
		}
	}

	private retryLastRun(): void {
		if (!this.lastPrompt || this.requestInFlight) return;
		this.lastErrorEl?.remove();
		this.lastErrorEl = null;
		const messages = this.currentChat.messages;
		const lastMessage = messages[messages.length - 1];
		if (lastMessage?.role === "assistant" && lastMessage.content === this.lastRunErrorText) messages.pop();
		const previousMessage = messages[messages.length - 1];
		if (previousMessage?.role === "user" && previousMessage.content === this.lastPrompt) messages.pop();
		this.renderCurrentChat();
		this.renderAttachmentChips();
		this.inputEl.value = this.lastPrompt;
		this.inputEl.dispatchEvent(new Event("input"));
		void this.submit();
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}
}
