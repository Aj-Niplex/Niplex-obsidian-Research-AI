import { App, Modal, Notice } from "obsidian";
import { APPROVAL_TOOL_NAMES, normalizeApprovalPrefix } from "../core/approval-policy";
import type { AgentSettings } from "../core/types";

export interface ApprovalPolicyHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
}

export class ApprovalPolicyModal extends Modal {
	private modeEl!: HTMLSelectElement;
	private durationEl!: HTMLSelectElement;
	private prefixEl!: HTMLInputElement;
	private toolEls = new Map<string, HTMLInputElement>();

	constructor(app: App, private readonly host: ApprovalPolicyHost) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-approval-policy-modal");
		contentEl.createEl("h2", { text: "Edit approval policy" });
		contentEl.createEl("p", { text: "Always ask is the safe default. A timed policy can auto-approve only selected file-write tools below one vault-relative folder prefix, and expires automatically.", cls: "oar-muted" });

		contentEl.createEl("label", { text: "Mode" });
		this.modeEl = contentEl.createEl("select");
		this.modeEl.add(new Option("Always ask", "always"));
		this.modeEl.add(new Option("Timed scoped window", "timed"));
		this.modeEl.value = this.host.settings.writeApprovalPolicy.mode;
		this.modeEl.addEventListener("change", () => this.updateVisibility());

		const timed = contentEl.createDiv({ cls: "oar-approval-policy-fields" });
		timed.createEl("label", { text: "Window duration" });
		this.durationEl = timed.createEl("select");
		for (const minutes of [5, 15, 30, 60]) this.durationEl.add(new Option(`${minutes} minutes`, String(minutes)));
		this.durationEl.value = "15";
		timed.createEl("label", { text: "Vault-relative folder prefix" });
		this.prefixEl = timed.createEl("input", { type: "text", placeholder: "For example: Projects/Research" });
		this.prefixEl.value = this.host.settings.writeApprovalPolicy.pathPrefix;
		timed.createEl("p", { text: "The prefix must be non-empty. A file named Projects/Researcher/note.md does not match Projects/Research.", cls: "oar-muted" });
		timed.createEl("strong", { text: "Allowed tools" });
		for (const tool of APPROVAL_TOOL_NAMES) {
			const label = timed.createEl("label", { cls: "oar-approval-tool" });
			const checkbox = label.createEl("input", { type: "checkbox" });
			checkbox.checked = this.host.settings.writeApprovalPolicy.tools.includes(tool);
			this.toolEls.set(tool, checkbox);
			label.createSpan({ text: tool === "create_file" ? "Create new files" : "Append to files" });
		}

		const actions = contentEl.createDiv({ cls: "oar-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		actions.createEl("button", { text: "Save policy", cls: "mod-cta" }).addEventListener("click", () => void this.save());
		this.updateVisibility();
	}

	private updateVisibility(): void {
		const fields = this.contentEl.querySelector<HTMLElement>(".oar-approval-policy-fields");
		if (fields) fields.toggleClass("is-hidden", this.modeEl.value !== "timed");
	}

	private async save(): Promise<void> {
		if (this.modeEl.value !== "timed") {
			this.host.settings.writeApprovalPolicy = { mode: "always", expiresAt: 0, pathPrefix: "", tools: [] };
			await this.host.saveSettings();
			new Notice("Write approvals will always ask.");
			this.close();
			return;
		}
		const pathPrefix = normalizeApprovalPrefix(this.prefixEl.value);
		const tools = [...this.toolEls.entries()].filter(([, checkbox]) => checkbox.checked).map(([tool]) => tool);
		if (!pathPrefix || !tools.length) {
			new Notice("Choose a valid folder prefix and at least one write tool, or use always ask.");
			return;
		}
		const minutes = Number.parseInt(this.durationEl.value, 10);
		this.host.settings.writeApprovalPolicy = { mode: "timed", expiresAt: Date.now() + Math.min(Math.max(minutes, 5), 60) * 60 * 1000, pathPrefix, tools };
		await this.host.saveSettings();
		new Notice(`Scoped write approvals enabled for ${minutes} minutes.`);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
