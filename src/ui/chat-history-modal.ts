import { App, Modal, Notice } from "obsidian";
import type { SavedChat } from "../core/types";
import { searchableChatText } from "../core/chat-history";

export interface ChatHistoryHost {
	getChats(): SavedChat[];
	onSelectChat(id: string): void;
	deleteChat(id: string): Promise<void>;
}

export class ChatHistoryModal extends Modal {
	private readonly host: ChatHistoryHost;
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;

	constructor(app: App, host: ChatHistoryHost) {
		super(app);
		this.host = host;
	}

	onOpen(): void {
		this.modalEl.addClass("oar-chat-history-modal");
		this.modalEl.parentElement?.addClass("oar-bottom-sheet-container");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-chat-history");
		contentEl.createDiv({ cls: "oar-action-sheet-handle", attr: { "aria-hidden": "true" } });
		contentEl.createEl("h2", { text: "Chat history" });
		contentEl.createEl("p", { text: "Every completed turn is saved locally under NIPLEX-Obsidian/chats. Search, reopen, or move an old chat to Obsidian trash.", cls: "oar-muted" });
		this.searchEl = contentEl.createEl("input", { type: "search", placeholder: "Search saved chats…", cls: "oar-history-search", attr: { "aria-label": "Search saved chats" } });
		this.searchEl.addEventListener("input", () => this.renderList());
		this.listEl = contentEl.createDiv({ cls: "oar-history-list" });
		this.renderList();
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		const query = this.searchEl?.value.trim().toLowerCase() ?? "";
		const chats = this.host.getChats().filter((chat) => {
			const subject = chat.subject ?? chat.title;
			return !query || searchableChatText(subject, chat.messages).includes(query);
		});
		if (!chats.length) {
			this.listEl.createDiv({ text: query ? "No saved chats match that search." : "No saved chats yet.", cls: "oar-muted" });
			return;
		}
		for (const chat of chats) {
			const row = this.listEl.createDiv({ cls: "oar-history-row" });
			const open = row.createEl("button", { cls: "oar-history-open" });
			open.createEl("strong", { text: (chat.subject ?? chat.title) || "Untitled chat" });
			open.createEl("small", { text: `${new Date(chat.updatedAt).toLocaleString()} · ${chat.messages.filter((message) => message.role === "user").length} question(s)` });
			open.addEventListener("click", () => {
				this.host.onSelectChat(chat.id);
				this.close();
			});
			const deleteButton = row.createEl("button", { text: "Delete", cls: "oar-history-delete", attr: { "aria-label": `Delete ${chat.subject ?? chat.title}` } });
			deleteButton.addEventListener("click", () => void this.deleteChat(chat.id));
		}
	}

	private async deleteChat(id: string): Promise<void> {
		await this.host.deleteChat(id);
		this.renderList();
		new Notice("Saved chat moved to Obsidian trash.");
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
