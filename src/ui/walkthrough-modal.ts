import { App, Modal, Notice } from "obsidian";
import type { AgentSettings } from "../core/types";

export const WALKTHROUGH_VERSION = 1;

export interface WalkthroughHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
}

export class WalkthroughModal extends Modal {
	constructor(app: App, private readonly host: WalkthroughHost) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-walkthrough-modal");
		contentEl.createEl("p", { text: "A privacy-aware research companion for your vault", cls: "oar-walkthrough-kicker" });
		contentEl.createEl("h2", { text: "Welcome to agentic research" });
		contentEl.createEl("p", {
			text: "The agent plans small steps, asks for only the context it needs, and shows its work as compact activity cards.",
			cls: "oar-muted",
		});

		const steps = [
			["1", "Connect a provider", "Add a Gemini or Agnes API key in plugin settings. Keys stay in Obsidian SecretStorage and are not saved in chat data."],
			["2", "Start from your MOCs", "When MOCs super.md exists, every run receives a bounded snapshot first. The agent can then choose relevant category MOCs and notes instead of opening your whole vault."],
			["3", "Read in bounded windows", "Each read_file_chunk call is limited by your settings. The agent may continue to another relevant file, but it never uploads the entire vault in one request."],
			["4", "Fallback stays in-provider", "If the selected model is rate-limited, the plugin checks that provider's live catalogue and tries another available model. It does not silently switch from Gemini to Agnes or vice versa."],
			["5", "Writes always ask first", "Creating or appending a note pauses for your approval. You can deny the action and continue researching without changing the vault."],
		];
		const list = contentEl.createDiv({ cls: "oar-walkthrough-list" });
		for (const [number, title, description] of steps) {
			const item = list.createDiv({ cls: "oar-walkthrough-item" });
			item.createSpan({ text: number, cls: "oar-walkthrough-number" });
			const copy = item.createDiv({ cls: "oar-walkthrough-copy" });
			copy.createEl("strong", { text: title });
			copy.createEl("p", { text: description });
		}

		const footer = contentEl.createDiv({ cls: "oar-walkthrough-footer" });
		footer.createEl("small", { text: "You can reopen this guide from settings → first-time walkthrough.", cls: "oar-muted" });
		const actions = footer.createDiv({ cls: "oar-walkthrough-actions" });
		const skip = actions.createEl("button", { text: "Skip walkthrough" });
		skip.addEventListener("click", () => void this.finish("Walkthrough skipped. You can reopen it from settings."));
		const done = actions.createEl("button", { text: "Got it — start researching", cls: "mod-cta" });
		done.addEventListener("click", () => void this.finish("Walkthrough complete."));
	}

	private async finish(message: string): Promise<void> {
		this.host.settings.onboardingVersion = WALKTHROUGH_VERSION;
		await this.host.saveSettings();
		new Notice(message);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
