import { App, Modal, Notice } from "obsidian";
import type { AgentSettings } from "../core/types";

export const WALKTHROUGH_VERSION = 2;

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
				["1", "Connect a provider", "Add a Gemini or Agnes API key in plugin settings. Keys stay in Obsidian SecretStorage and are never written into NIPLEX-OBSIDIAN, chats, prompts, or MOCs."],
				["2", "Use transparent prompts", "The built-in Aj-Niplex/Niplex policy is visible and read-only. Your custom system prompt is additive preferences only; it cannot replace bounded access, privacy rules, or approvals."],
				["3", "Choose context deliberately", "MOCs are generated under NIPLEX-OBSIDIAN/MOCs. You can attach up to eight specific Markdown files, but only bounded windows are read for that run; whole-file and whole-vault uploads are not defaults."],
				["4", "Keep your graph tidy", "For a cleaner Obsidian Graph View, manually exclude NIPLEX-OBSIDIAN/ in Graph View filters. This plugin does not silently change Obsidian's global graph settings."],
				["5", "Approve durable edits", "Writes ask first by default. If you explicitly configure a short timed window, only selected write tools under one folder prefix may auto-approve; everything else still asks and expiry returns to always ask."],
				["6", "Keep history local", "Saved chats are readable Markdown under NIPLEX-OBSIDIAN/Chats and can be searched or deleted in the plugin. Runtime metadata remains protected from agent reads."],
				["7", "Install skills safely", "The optional helper plugin can look up a five-character marketplace code from the Niplex-Obsidian-skills catalogue. Preview and approve instruction-only skills; they cannot run scripts, obtain keys, bypass approvals, or replace the protected prompt."],
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
		footer.createEl("small", { text: "You can reopen this guide from settings → first-time walkthrough. Niplex-Obsidian is user-owned vault data; exclude it from the graph only if you want a cleaner visual map.", cls: "oar-muted" });
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
