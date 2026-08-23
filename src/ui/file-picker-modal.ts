import { App, Modal, Notice } from "obsidian";

export type AttachmentMode = "files" | "folder";

export interface FilePickerHost {
	searchMarkdownPaths(query: string, limit?: number): string[];
	getMarkdownFolders(limit?: number): string[];
	getMarkdownFilesInFolder(folder: string, limit?: number): string[];
}

const MAX_ATTACHMENTS = 8;

export class FilePickerModal extends Modal {
	private readonly selected: Set<string>;
	private readonly mode: AttachmentMode;
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private countEl!: HTMLElement;

	constructor(app: App, private readonly host: FilePickerHost, selected: string[], private readonly onSave: (paths: string[]) => void, mode: AttachmentMode = "files") {
		super(app);
		this.selected = new Set(selected);
		this.mode = mode;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-file-picker-modal");
		contentEl.createEl("h2", { text: this.mode === "folder" ? "Attach a vault folder" : "Attach vault files" });
		contentEl.createEl("p", {
			text: this.mode === "folder" ? "Choose a folder to add up to eight Markdown descendants. Only bounded windows are read when you run the agent." : "Choose up to eight specific Markdown files. Bodies are read only when you run the agent and remain bounded.",
			cls: "oar-muted",
		});
		this.searchEl = contentEl.createEl("input", { type: "search", placeholder: this.mode === "folder" ? "Search vault folders…" : "Search Markdown paths…", cls: "oar-file-picker-search", attr: { "aria-label": this.mode === "folder" ? "Search vault folders" : "Search Markdown paths" } });
		this.searchEl.addEventListener("input", () => this.renderList());
		this.countEl = contentEl.createDiv({ cls: "oar-file-picker-count", attr: { "aria-live": "polite" } });
		this.listEl = contentEl.createDiv({ cls: "oar-file-picker-list" });
		this.renderList();
		const actions = contentEl.createDiv({ cls: "oar-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		actions.createEl("button", { text: `Use selected (${this.selected.size})`, cls: "mod-cta" }).addEventListener("click", () => {
			this.onSave([...this.selected]);
			this.close();
		});
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		if (this.mode === "folder") this.renderFolders();
		else this.renderFiles();
		this.refreshLabels();
	}

	private renderFiles(): void {
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
					if (this.selected.size >= MAX_ATTACHMENTS) {
						checkbox.checked = false;
						new Notice(`You can attach up to ${MAX_ATTACHMENTS} Markdown files per run.`);
						return;
					}
					this.selected.add(path);
				} else this.selected.delete(path);
				this.refreshLabels();
			});
			label.createSpan({ text: path });
		}
	}

	private renderFolders(): void {
		const query = (this.searchEl?.value ?? "").trim().toLowerCase();
		const folders = this.host.getMarkdownFolders(120).filter((folder) => !query || folder.toLowerCase().includes(query));
		if (!folders.length) {
			this.listEl.createDiv({ text: "No matching folders with Markdown files.", cls: "oar-muted" });
			return;
		}
		for (const folder of folders) {
			const files = this.host.getMarkdownFilesInFolder(folder, MAX_ATTACHMENTS);
			const row = this.listEl.createDiv({ cls: "oar-file-picker-folder" });
			row.createDiv({ text: folder, cls: "oar-file-picker-folder-name" });
			row.createDiv({ text: `Adds up to ${Math.min(files.length, MAX_ATTACHMENTS)} Markdown files`, cls: "oar-muted" });
			const button = row.createEl("button", { text: "Use folder" });
			button.disabled = files.length === 0;
			button.addEventListener("click", () => {
				for (const path of files) {
					if (this.selected.size >= MAX_ATTACHMENTS) break;
					this.selected.add(path);
				}
			this.refreshLabels();
			new Notice(`Added bounded folder context from ${folder}.`);
			});
		}
	}

	private refreshLabels(): void {
		if (this.countEl) this.countEl.textContent = `${this.selected.size} / ${MAX_ATTACHMENTS} Markdown files selected. File bodies stay unread until the run.`;
		const button = this.contentEl.querySelector<HTMLButtonElement>(".oar-modal-actions .mod-cta");
		if (button) button.textContent = `Use selected (${this.selected.size})`;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
