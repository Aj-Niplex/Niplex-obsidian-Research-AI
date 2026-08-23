import { App, Modal, Notice } from "obsidian";
import { getBuiltinSystemPrompt, getPromptBypassNotice, getPromptProtectionExplanation, getPromptStorageNotice, getUserPromptPlaceholder, normalizeUserSystemPrompt, SYSTEM_PROMPT_LIMITS } from "../core/system-prompt";
import type { AgentSettings } from "../core/types";

export interface PromptHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
}

export class PromptModal extends Modal {
	constructor(app: App, private readonly host: PromptHost) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-prompt-modal");
		contentEl.createEl("h2", { text: "System prompts" });
			contentEl.createDiv({ cls: "oar-prompt-badge", text: "Protected policy visible · custom preferences additive" });
		contentEl.createEl("p", { text: "Inspect the protected plugin policy and add your own preferences without replacing the safety layer.", cls: "oar-muted" });

		contentEl.createEl("h3", { text: "Protected built-in system prompt" });
		contentEl.createEl("p", { text: `${getPromptProtectionExplanation()} ${getPromptBypassNotice()}`, cls: "oar-muted" });
			const builtIn = contentEl.createEl("textarea", { cls: "oar-prompt-readonly", attr: { rows: "14" } });
			builtIn.readOnly = true;
			builtIn.value = getBuiltinSystemPrompt();
			builtIn.setAttribute("aria-label", "Protected built-in system prompt");
			builtIn.setAttribute("aria-describedby", "oar-prompt-protected-note");
			const protectedNote = contentEl.createDiv({ cls: "oar-prompt-note", attr: { id: "oar-prompt-protected-note" } });
			protectedNote.textContent = "Read-only preview. This policy is re-injected on every run.";

		contentEl.createEl("h3", { text: "Your custom system prompt · 6,000-character cap" });
		contentEl.createEl("p", { text: `${getUserPromptPlaceholder()} ${getPromptStorageNotice()}`, cls: "oar-muted" });
			const custom = contentEl.createEl("textarea", { cls: "oar-prompt-editor", attr: { rows: "8", maxlength: String(SYSTEM_PROMPT_LIMITS.maxUserChars), placeholder: getUserPromptPlaceholder(), "aria-label": "Your custom system prompt" } });
			custom.value = this.host.settings.userSystemPrompt;
			const counter = contentEl.createDiv({ cls: "oar-prompt-counter", attr: { "aria-live": "polite" } });
			const updateCounter = () => {
				const remaining = Math.max(0, SYSTEM_PROMPT_LIMITS.maxUserChars - custom.value.length);
				counter.textContent = `${custom.value.length.toLocaleString()} / ${SYSTEM_PROMPT_LIMITS.maxUserChars.toLocaleString()} characters · about ${SYSTEM_PROMPT_LIMITS.approximateTokenCeiling.toLocaleString()} tokens maximum for this field`;
				counter.toggleClass("is-near-limit", remaining < 500);
			};
			custom.addEventListener("input", updateCounter);
			updateCounter();

			const actions = contentEl.createDiv({ cls: "oar-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		actions.createEl("button", { text: "Save custom prompt", cls: "mod-cta" }).addEventListener("click", () => void this.save(custom.value));
	}

	private async save(value: string): Promise<void> {
		this.host.settings.userSystemPrompt = normalizeUserSystemPrompt(value);
		await this.host.saveSettings();
		new Notice(this.host.settings.userSystemPrompt ? "Custom system prompt saved." : "Custom system prompt cleared.");
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
