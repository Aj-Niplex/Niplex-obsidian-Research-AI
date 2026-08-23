import { App, Modal, Notice } from "obsidian";

export interface DiagnosticsHost {
	getDiagnosticsText(): string;
	clearDiagnostics(): void;
}

async function copyText(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}
	throw new Error("Clipboard API unavailable");
}

export class DiagnosticsModal extends Modal {
	constructor(app: App, private readonly host: DiagnosticsHost) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-diagnostics-modal");
		contentEl.createEl("h2", { text: "Share diagnostics" });
		contentEl.createEl("p", {
			text: "These logs are local and redacted. They include provider/model events and short error summaries, but not API keys, prompts, model answers, or vault excerpts.",
			cls: "oar-muted",
		});
		const preview = contentEl.createEl("textarea", { cls: "oar-diagnostics-preview", attr: { readonly: "true", "aria-label": "Redacted diagnostics" } });
		preview.value = this.host.getDiagnosticsText();
		preview.rows = 12;

		const actions = contentEl.createDiv({ cls: "oar-diagnostics-actions" });
		const share = actions.createEl("button", { text: "Share / copy logs", cls: "mod-cta" });
		share.addEventListener("click", () => void this.share(preview.value));
		const clear = actions.createEl("button", { text: "Clear logs" });
		clear.addEventListener("click", () => {
			this.host.clearDiagnostics();
			preview.value = this.host.getDiagnosticsText();
			new Notice("Diagnostics cleared.");
		});
	}

	private async share(text: string): Promise<void> {
		try {
			const browserNavigator = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
			const usedNativeShare = typeof browserNavigator.share === "function";
			if (usedNativeShare) await browserNavigator.share({ title: "Niplex Research AI diagnostics", text });
			else await copyText(text);
			new Notice(usedNativeShare ? "Diagnostics shared." : "Diagnostics copied to the clipboard.");
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") return;
			new Notice("Could not share diagnostics. You can select and copy the text manually.");
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
