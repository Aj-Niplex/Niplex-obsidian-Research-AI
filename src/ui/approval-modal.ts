import { App, Modal } from "obsidian";
import type { ToolCall, ToolDefinition } from "../core/types";

export class ApprovalModal extends Modal {
	private resolver: ((value: boolean) => void) | null = null;
	private settled = false;

	constructor(app: App, private readonly tool: ToolDefinition, private readonly call: ToolCall) {
		super(app);
	}

	confirm(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	private finish(value: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolver?.(value);
		this.close();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Approve agent action" });
		contentEl.createEl("p", { text: `The agent wants to run ${this.tool.name}.` });
		contentEl.createEl("pre", { text: JSON.stringify(this.call.arguments, null, 2) });
		const actions = contentEl.createDiv({ cls: "oar-modal-actions" });
		actions.createEl("button", { text: "Deny" }).addEventListener("click", () => this.finish(false));
		actions.createEl("button", { text: "Approve", cls: "mod-cta" }).addEventListener("click", () => this.finish(true));
	}

	onClose(): void {
		if (!this.settled) {
			this.settled = true;
			this.resolver?.(false);
		}
		this.contentEl.empty();
	}
}
