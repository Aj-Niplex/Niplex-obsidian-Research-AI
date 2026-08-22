import { ItemView, WorkspaceLeaf } from "obsidian";
import type { AgentEvent } from "../core/agent-runtime";

export const AGENT_VIEW_TYPE = "obsidian-agentic-research-view";

export interface AgentViewHost {
	runAgent(prompt: string, emit: (event: AgentEvent) => void): Promise<string>;
}

export class AgentView extends ItemView {
	private readonly host: AgentViewHost;
	private transcriptEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private runButton!: HTMLButtonElement;

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

		this.transcriptEl = root.createDiv({ cls: "oar-transcript" });
		this.appendSystem("Ready. Start with a focused research question.");

		const composer = root.createDiv({ cls: "oar-composer" });
		this.inputEl = composer.createEl("textarea", {
			attr: { rows: "4", placeholder: "Ask the agent to research your vault…" },
		});
		this.runButton = composer.createEl("button", { text: "Run agent", cls: "mod-cta" });
		this.runButton.addEventListener("click", () => void this.submit());
		this.inputEl.addEventListener("keydown", (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
		});
	}

	private appendSystem(text: string): void {
		const block = this.transcriptEl.createDiv({ cls: "oar-message oar-system" });
		block.createDiv({ text });
	}

	private appendUser(text: string): void {
		const block = this.transcriptEl.createDiv({ cls: "oar-message oar-user" });
		block.createEl("strong", { text: "You" });
		block.createDiv({ text });
	}

	private appendEvent(event: AgentEvent): void {
		if (event.type === "text") {
			const block = this.transcriptEl.createDiv({ cls: "oar-message oar-assistant" });
			block.createEl("strong", { text: "Agent" });
			block.createDiv({ text: event.message });
			return;
		}
		const cls = event.type === "error" ? "oar-error" : "oar-tool";
		const block = this.transcriptEl.createDiv({ cls: `oar-message ${cls}` });
		block.createEl("small", { text: event.type === "tool" ? `Tool: ${event.tool?.name ?? "unknown"}` : "Status" });
		block.createDiv({ text: event.message });
		this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
	}

	private async submit(): Promise<void> {
		const prompt = this.inputEl.value.trim();
		if (!prompt || this.runButton.disabled) return;
		this.inputEl.value = "";
		this.appendUser(prompt);
		this.runButton.disabled = true;
		this.runButton.textContent = "Running…";
		try {
			await this.host.runAgent(prompt, (event) => this.appendEvent(event));
		} catch (error) {
			this.appendEvent({ type: "error", message: error instanceof Error ? error.message : "Agent run failed." });
		} finally {
			this.runButton.disabled = false;
				this.runButton.textContent = "Run agent";
		}
	}


	async onClose(): Promise<void> {
		this.containerEl.empty();
	}
}
