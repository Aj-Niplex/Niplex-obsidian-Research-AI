import { App, Modal, Notice } from "obsidian";
import type { AgentSettings } from "../core/types";

export const WALKTHROUGH_VERSION = 3;

export interface WalkthroughHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	getSecret(id: string): string | null;
	openMocBuilder(): void;
	isCompanionInstalled(pluginId: string): boolean;
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
			text: "We will prepare the local workspace, check your provider setup, and then let you continue to map setup. You can close this window at any time; no third-party plugin is installed silently.",
			cls: "oar-muted",
		});

		const setupCard = contentEl.createDiv({ cls: "oar-setup-card" });
		setupCard.createEl("strong", { text: "Setting up your local workspace" });
		const setupStatus = setupCard.createDiv({ cls: "oar-setup-status", attr: { "aria-live": "polite" } });
		setupStatus.textContent = "Please keep this window open while setup is prepared…";
		const setupAction = setupCard.createEl("button", { text: "Preparing setup…", cls: "oar-setup-progress-button", attr: { type: "button" } });
		setupAction.disabled = true;

		const companionCard = contentEl.createDiv({ cls: "oar-companion-card" });
		companionCard.createEl("strong", { text: "Optional companions" });
		companionCard.createEl("p", {
			text: "The main plugin works by itself. Companion plugins are never downloaded or enabled without your explicit action.",
			cls: "oar-muted",
		});
		this.renderCompanion(companionCard, "Niplex Skills Helper", "niplex-skills-helper", "Look up and preview five-character instruction-skill packages.", "https://github.com/Aj-Niplex/niplex-obsidian-helper/releases/tag/0.1.1");
		this.renderCompanion(companionCard, "Iconize", "obsidian-icon-folder", "Optional file and folder icons. The main plugin already includes its own interface icons, so this is not required.", "https://github.com/FlorianWoelki/obsidian-iconize");

		const steps: Array<[string, string, string]> = [
			["1", "Connect a provider", "Add a Gemini or Agnes API key in plugin settings. Keys stay in Obsidian SecretStorage and are never written into NIPLEX-OBSIDIAN, chats, prompts, or MOCs."],
			["2", "Use transparent prompts", "The built-in Aj-Niplex/Niplex policy is visible and read-only. Your custom system prompt is additive preferences only; it cannot replace bounded access, privacy rules, or approvals."],
			["3", "Choose context deliberately", "MOCs are generated under NIPLEX-OBSIDIAN/MOCs. You can attach up to eight specific Markdown files, but only bounded windows are read for that run; whole-file and whole-vault uploads are not defaults."],
			["4", "Keep your graph tidy", "For a cleaner Obsidian Graph View, manually exclude NIPLEX-OBSIDIAN/ in Graph View filters. This plugin does not silently change Obsidian's global graph settings."],
			["5", "Approve durable edits", "Writes ask first by default. If you explicitly configure a short timed window, only selected write tools under one folder prefix may auto-approve; everything else still asks and expiry returns to always ask."],
			["6", "Keep history local", "Saved chats are readable Markdown under NIPLEX-OBSIDIAN/Chats and can be searched or deleted in the plugin. Runtime metadata remains protected from agent reads."],
			["7", "Install skills safely", "The optional helper plugin can look up a five-character marketplace code from the Niplex skills catalogue. Preview and approve instruction-only skills; they cannot run scripts, obtain keys, bypass approvals, or replace the protected prompt."],
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
		footer.createEl("small", { text: "You can reopen this guide from settings → first-time walkthrough. Use the map builder now or later from the chat composer. Exclude NIPLEX-Obsidian/ from the graph only if you want a cleaner visual map.", cls: "oar-muted" });
		const actions = footer.createDiv({ cls: "oar-walkthrough-actions" });
		const moc = actions.createEl("button", { text: "Continue to map setup", cls: "oar-walkthrough-moc-button", attr: { type: "button" } });
		moc.disabled = true;
		moc.addEventListener("click", () => void this.finishAndOpenMoc());
		const skip = actions.createEl("button", { text: "I’ll do this later", attr: { type: "button" } });
		skip.addEventListener("click", () => void this.finish("Setup saved. You can reopen it from settings."));
		const done = actions.createEl("button", { text: "Got it — start researching", cls: "mod-cta", attr: { type: "button" } });
		done.addEventListener("click", () => void this.finish("Setup complete. Start with a focused research question."));

		void this.runSetup(setupStatus, setupAction, moc);
	}

	private renderCompanion(parent: HTMLElement, name: string, pluginId: string, description: string, url: string): void {
		const row = parent.createDiv({ cls: "oar-companion-row" });
		const installed = this.host.isCompanionInstalled(pluginId);
		const copy = row.createDiv({ cls: "oar-companion-copy" });
		copy.createEl("strong", { text: `${name} — ${installed ? "detected" : "not installed"}` });
		copy.createEl("p", { text: description });
		const link = row.createEl("a", { text: installed ? "View details" : "Open install page", href: url });
		link.target = "_blank";
		link.rel = "noopener";
	}

	private async runSetup(status: HTMLElement, action: HTMLButtonElement, moc: HTMLButtonElement): Promise<void> {
		const geminiReady = Boolean(this.host.getSecret("oar-gemini-api-key"));
		const agnesReady = Boolean(this.host.getSecret("oar-agnes-api-key"));
		const providerStatus = geminiReady || agnesReady ? "at least one provider key is stored securely" : "no provider key is stored yet; add one in plugin settings";
		const helperStatus = this.host.isCompanionInstalled("niplex-skills-helper") ? "Skills Helper detected" : "Skills Helper remains optional";
		const steps = [
			"1/4 Checking the local workspace…",
			"2/4 Local folders ready: Chats, Prompts, Memory, Runtime, Skills, and MOCs.",
			`3/4 Provider check complete: ${providerStatus}.`,
			`4/4 Companion check complete: ${helperStatus}; Iconize remains optional and manual.`,
		];
		for (const message of steps) {
			await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
			if (!status.isConnected) return;
			status.textContent = message;
		}
		action.disabled = false;
		action.textContent = "Setup complete";
		moc.disabled = false;
	}

	private async finishAndOpenMoc(): Promise<void> {
		await this.finish("Setup complete. Opening the Map builder.");
		this.host.openMocBuilder();
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
