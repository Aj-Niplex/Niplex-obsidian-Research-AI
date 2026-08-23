import { App, Modal } from "obsidian";

export class AttachmentChoiceModal extends Modal {
	constructor(app: App, private readonly onFiles: () => void, private readonly onFolder: () => void) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("oar-attachment-choice-modal");
		this.modalEl.parentElement?.addClass("oar-bottom-sheet-container");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-attachment-choice");
		contentEl.createDiv({ cls: "oar-action-sheet-handle", attr: { "aria-hidden": "true" } });
		contentEl.createEl("h2", { text: "Add context" });
		contentEl.createEl("p", { text: "Choose exactly what to make available for the next bounded run. A folder adds up to eight Markdown files; it does not upload the folder wholesale.", cls: "oar-muted" });
		const actions = contentEl.createDiv({ cls: "oar-attachment-choice-actions" });
		this.addChoice(actions, "Files", "Pick specific Markdown files.", () => this.onFiles());
		this.addChoice(actions, "Folder", "Pick a folder and add up to eight Markdown descendants.", () => this.onFolder());
	}

	private addChoice(root: HTMLElement, title: string, description: string, callback: () => void): void {
		const button = root.createEl("button", { cls: "oar-action-card" });
		button.createEl("strong", { text: title });
		button.createEl("small", { text: description });
		button.addEventListener("click", () => {
			this.close();
			callback();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
