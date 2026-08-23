import { App, Modal, Notice } from "obsidian";

export interface FilePickerHost {
	searchMarkdownPaths(query: string, limit?: number): string[];
}

export class FilePickerModal extends Modal {
	private readonly selected: Set<string>;
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;

	constructor(app: App, private readonly host: FilePickerHost, selected: string[], private readonly onSave: (paths: string[]) => void) {
		super(app);
		this.selected = new Set(selected);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-file-picker-modal");
		contentEl.createEl("h2", { text: "Attach vault files" });
		contentEl.createEl("p", { text: "Choose up to 8 files to include beside the bounded super-moc snapshot. Bodies are read only when you run the agent and remain bounded.", cls: "oar-muted" });
		this.searchEl = contentEl.createEl("input", { type: "search", placeholder: "Search Markdown paths…", cls: "oar-file-picker-search", attr: { "aria-label": "Search Markdown paths" } });
		this.searchEl.addEventListener("input", () => this.renderList());
		this.listEl = contentEl.createDiv({ cls: "oar-file-picker-list" });
		this.renderList();
		const actions = contentEl.createDiv({ cls: "oar-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		actions.createEl("button", { text: `Attach selected (${this.selected.size})`, cls: "mod-cta" }).addEventListener("click", () => {
			this.onSave([...this.selected]);
			this.close();
		});
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		const paths = this.host.searchMarkdownPaths(this.searchEl?.value ?? "", 120);
		if (!paths.length) {
			this.listEl.createDiv({ text: "No matching Markdown files.", cls: "oar-muted" });
			return;
		}
		for (const path of paths) {
			const label = this.listEl.createEl("label", { cls: "oar-file-picker-item" });
			const checkbox = label.createEl("input", { type: "checkbox" });
			checkbox.checked = this.selected.has(path);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					if (this.selected.size >= 8) {
						checkbox.checked = false;
						new Notice("You can attach up to 8 files per run.");
						return;
					}
					this.selected.add(path);
				} else this.selected.delete(path);
				this.refreshButtonLabel();
			});
			label.createSpan({ text: path });
		}
	}

	private refreshButtonLabel(): void {
		const button = this.contentEl.querySelector<HTMLButtonElement>(".oar-modal-actions .mod-cta");
		if (button) button.textContent = `Attach selected (${this.selected.size})`;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
