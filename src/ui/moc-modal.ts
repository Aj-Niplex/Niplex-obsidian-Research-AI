import { App, Modal, Notice, Setting } from "obsidian";
import type { ToolResult } from "../core/types";

export interface MocHost {
	settings: { activeMocPath: string };
	getMocFiles(): string[];
	getRecentMarkdownFiles(limit?: number): string[];
	createMoc(path: string): Promise<ToolResult>;
	adjustMoc(path: string): Promise<ToolResult>;
	setActiveMoc(path: string): Promise<void>;
}

export class MocModal extends Modal {
	private readonly host: MocHost;
	private readonly onDone: () => void;
	private mode: "create" | "adjust" = "create";
	private pathEl!: HTMLInputElement;
	private mocSelect!: HTMLSelectElement;

	constructor(app: App, host: MocHost, onDone: () => void) {
		super(app);
		this.host = host;
		this.onDone = onDone;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-moc-modal");
		contentEl.createEl("h2", { text: "Map of content" });
		contentEl.createEl("p", {
			text: "Use a link-only map to guide the agent without opening every note.",
			cls: "oar-muted",
		});

		const mode = contentEl.createDiv({ cls: "oar-moc-mode" });
		const createButton = mode.createEl("button", { text: "Create new moc" });
		const adjustButton = mode.createEl("button", { text: "Adjust recent file" });
		createButton.addEventListener("click", () => {
			this.mode = "create";
			this.renderBody();
		});
		adjustButton.addEventListener("click", () => {
			this.mode = "adjust";
			this.renderBody();
		});
		this.renderBody();
	}

	private renderBody(): void {
		const existing = this.contentEl.querySelector(".oar-moc-body");
		existing?.remove();
		const body = this.contentEl.createDiv({ cls: "oar-moc-body" });
		if (this.mode === "create") {
			new Setting(body)
				.setName("New moc path")
				.setDesc("Only note links and file metadata are used; note bodies are not copied.")
				.addText((text) => {
					this.pathEl = text.inputEl;
					text.setValue("MOCs/Vault Map.md");
				});
			const active = body.createEl("p", { cls: "oar-muted" });
			active.textContent = this.host.settings.activeMocPath ? `Current scope: ${this.host.settings.activeMocPath}` : "No MOC is currently selected.";
			const action = body.createEl("button", { text: "Create and use this moc", cls: "mod-cta" });
			action.addEventListener("click", () => void this.create());
			return;
		}

		const mocs = this.host.getMocFiles();
		if (mocs.length === 0) {
			body.createEl("p", { text: "No moc-like Markdown files were found. Create one first." });
			return;
		}
		new Setting(body)
			.setName("Moc to adjust")
			.setDesc("The newest eligible Markdown note will be added as a link only.")
			.addDropdown((dropdown) => {
				this.mocSelect = dropdown.selectEl;
				dropdown.addOptions(Object.fromEntries(mocs.map((path) => [path, path])));
				dropdown.setValue(this.host.settings.activeMocPath && mocs.includes(this.host.settings.activeMocPath) ? this.host.settings.activeMocPath : mocs[0] ?? "");
			});
		const recent = this.host.getRecentMarkdownFiles(3);
		body.createEl("p", { text: recent.length ? `Recent candidates: ${recent.join(", ")}` : "No recent Markdown notes found.", cls: "oar-muted" });
		const action = body.createEl("button", { text: "Adjust and use this moc", cls: "mod-cta" });
		action.addEventListener("click", () => void this.adjust());
	}

	private async create(): Promise<void> {
		const path = this.pathEl?.value.trim() ?? "";
		const result = await this.host.createMoc(path);
		void this.finish(result, result.ok ? path : "");
	}

	private async adjust(): Promise<void> {
		const path = this.mocSelect?.value ?? "";
		const result = await this.host.adjustMoc(path);
		void this.finish(result, result.ok ? path : "");
	}

	private async finish(result: ToolResult, activePath: string): Promise<void> {
		new Notice(result.content);
		if (result.ok && activePath) {
			await this.host.setActiveMoc(activePath);
			this.onDone();
			this.close();
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
