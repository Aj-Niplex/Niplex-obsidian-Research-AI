import { App, Modal, Notice } from "obsidian";
import type { AgentSettings } from "../core/types";
import { COMPANION_PLUGINS, type CompanionPluginId, type CompanionPluginStatus } from "../core/companion-plugins";

export const WALKTHROUGH_VERSION = 4;

export interface WalkthroughHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	getSecret(id: string): string | null;
	openMocBuilder(autoStart?: boolean): void;
	openCommunityPlugins(): void;
	getCompanionStatus(pluginId: CompanionPluginId): Promise<CompanionPluginStatus>;
	openCompanionInstaller(mode: "first-install" | "updates" | "settings"): void;
}

const MOC_ROOT = "MOCs";
const MOC_NIPLEX_ROOT = "NIPLEX-OBSIDIAN/MOCs";

export class WalkthroughModal extends Modal {
	private locationStatusEl!: HTMLElement;
	private continueButton!: HTMLButtonElement;
	private locationSelected = false;
	private setupStarted = false;

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
			text: "We will check your companion plugins, prepare the local workspace, and start moc setup after you choose where generated maps belong. You can minimize the setup window while it runs, but do not close it until the build finishes.",
			cls: "oar-muted",
		});

		const setupCard = contentEl.createDiv({ cls: "oar-setup-card" });
		setupCard.createEl("strong", { text: "First-run setup" });
		const setupStatus = setupCard.createDiv({ cls: "oar-setup-status", attr: { "aria-live": "polite" } });
		setupStatus.textContent = "Checking the local workspace and companion plugins…";
		const setupAction = setupCard.createEl("button", { text: "Checking setup…", cls: "oar-setup-progress-button", attr: { type: "button" } });
			setupAction.disabled = true;
			setupAction.addEventListener("click", () => this.host.openCompanionInstaller("first-install"));

		const companionCard = contentEl.createDiv({ cls: "oar-companion-card" });
		companionCard.createEl("strong", { text: "Companion plugins" });
		companionCard.createEl("p", {
				text: "Niplex skills helper and research brain are important companions for the full ecosystem. On first setup, we will show their versions and release notes, then ask before downloading and enabling anything. Iconize and writing insights remain optional and are managed from settings. This plugin never silently downloads, enables, or replaces third-party code.",
			cls: "oar-muted",
		});
		for (const definition of COMPANION_PLUGINS) this.renderCompanion(companionCard, definition.id);

		const locationCard = contentEl.createDiv({ cls: "oar-moc-location-card" });
		locationCard.createEl("strong", { text: "Where should mocs be stored?" });
		locationCard.createEl("p", { text: "Choose the default location for category maps and mocs super.md. You can change it later in settings.", cls: "oar-muted" });
		const options = locationCard.createDiv({ cls: "oar-moc-location-options" });
		this.addLocationOption(options, "root", "Option 1 — folder in vault root", "MOCs/", MOC_ROOT);
		this.addLocationOption(options, "niplex", "Option 2 — under Niplex-Obsidian", "NIPLEX-OBSIDIAN/MOCs/", MOC_NIPLEX_ROOT);
		this.locationStatusEl = locationCard.createDiv({ cls: "oar-moc-location-status oar-muted", attr: { "aria-live": "polite" } });
		this.locationStatusEl.textContent = this.host.settings.mocLocationConfigured ? `Current default: ${this.host.settings.mocFolder}` : "Choose one option to continue.";

		const steps: Array<[string, string, string]> = [
			["1", "Connect a provider", "Add a Gemini or Agnes API key in plugin settings. Keys stay in Obsidian SecretStorage and are never written into NIPLEX-OBSIDIAN, chats, prompts, or MOCs."],
			["2", "Use transparent prompts", "The built-in Aj-Niplex/Niplex policy is visible and read-only. Your custom system prompt is additive preferences only; it cannot replace bounded access, privacy rules, or approvals."],
			["3", "Choose context deliberately", "MOCs are navigation indexes. You can attach up to eight specific Markdown files, but only bounded windows are read for that run; whole-file and whole-vault uploads are not defaults."],
			["4", "Keep your graph tidy", "For a cleaner Obsidian Graph View, manually exclude NIPLEX-OBSIDIAN/ in Graph View filters. This plugin does not silently change Obsidian's global graph settings."],
			["5", "Approve durable edits", "Writes ask first by default. If you explicitly configure a short timed window, only selected write tools under one folder prefix may auto-approve; everything else still asks."],
			["6", "Keep history local", "Saved chats are readable Markdown under NIPLEX-OBSIDIAN/Chats. Runtime metadata remains protected from agent reads."],
			["7", "Install skills safely", "The optional helper searches five-character marketplace codes from the Niplex skills catalogue. Preview and approve instruction-only skills; they cannot run scripts, obtain keys, bypass approvals, or replace the protected prompt."],
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
		footer.createEl("small", { text: "You can reopen this guide from settings → first-time walkthrough. After choosing a location, the moc builder starts automatically. Keep that setup window open until it completes; minimizing it is fine.", cls: "oar-muted" });
		const actions = footer.createDiv({ cls: "oar-walkthrough-actions" });
		this.continueButton = actions.createEl("button", { text: "Start moc setup", cls: "oar-walkthrough-moc-button mod-cta", attr: { type: "button" } });
		this.continueButton.disabled = !this.host.settings.mocLocationConfigured;
		this.continueButton.addEventListener("click", () => void this.startMocSetup());
		const skip = actions.createEl("button", { text: "Do this later", attr: { type: "button" } });
		skip.addEventListener("click", () => void this.finish("Setup saved. You can reopen it from settings."));
		const done = actions.createEl("button", { text: "Start researching", attr: { type: "button" } });
		done.addEventListener("click", () => void this.finish("Setup saved. Start with a focused research question."));

		void this.runSetup(setupStatus, setupAction);
	}

	private renderCompanion(parent: HTMLElement, pluginId: CompanionPluginId): void {
		const definition = COMPANION_PLUGINS.find((plugin) => plugin.id === pluginId);
		if (!definition) return;
		const row = parent.createDiv({ cls: "oar-companion-row" });
		const copy = row.createDiv({ cls: "oar-companion-copy" });
		copy.createEl("strong", { text: `${definition.name} — checking…` });
		copy.createEl("p", { text: definition.description });
		const action = row.createEl("button", { text: "Checking…", attr: { type: "button" } });
		action.disabled = true;
		void this.refreshCompanion(row, action, definition.id);
	}

	private openCompanionCommunity(definition: (typeof COMPANION_PLUGINS)[number]): void {
		this.host.openCommunityPlugins();
		new Notice(`In Community plugins, search for “${definition.communitySearchName}”.`, 7000);
	}

	private addManualFallback(row: HTMLElement, definition: (typeof COMPANION_PLUGINS)[number]): void {
		row.createEl("a", {
			text: "Manual GitHub install",
			cls: "oar-companion-fallback-link",
			attr: { href: definition.manualInstallUrl, target: "_blank", rel: "noopener" },
		});
	}

	private async refreshCompanion(row: HTMLElement, action: HTMLButtonElement, pluginId: CompanionPluginId): Promise<void> {
			const definition = COMPANION_PLUGINS.find((plugin) => plugin.id === pluginId);
			if (!definition) return;
			const label = row.querySelector("strong");
			try {
				const status = await this.host.getCompanionStatus(pluginId);
				const version = status.installedVersion ? ` v${status.installedVersion}` : "";
				if (!status.installed) {
					if (label) label.textContent = `${definition.name} — not installed`;
					action.textContent = "Open Obsidian plugins";
					action.disabled = false;
					action.addEventListener("click", () => this.openCompanionCommunity(definition));
					this.addManualFallback(row, definition);
					return;
				}
				if (!status.upToDate) {
					if (label) label.textContent = `${definition.name} — update recommended${version}`;
					action.textContent = "Open Obsidian plugins";
					action.disabled = false;
					action.addEventListener("click", () => this.openCompanionCommunity(definition));
					this.addManualFallback(row, definition);
					return;
				}
				if (!status.enabled) {
					if (label) label.textContent = `${definition.name} — installed${version}, disabled`;
					action.textContent = "Open community plugins";
					action.disabled = false;
					action.addEventListener("click", () => this.host.openCommunityPlugins());
					return;
				}
				if (label) label.textContent = `${definition.name} — ready${version}`;
				action.textContent = "Up to date";
				action.disabled = true;
			} catch {
				if (label) label.textContent = `${definition.name} — status unavailable`;
				action.textContent = "Open Obsidian plugins";
				action.disabled = false;
				action.addEventListener("click", () => this.openCompanionCommunity(definition));
				this.addManualFallback(row, definition);
			}
		}

	private addLocationOption(parent: HTMLElement, value: "root" | "niplex", title: string, path: string, folder: string): void {
		const label = parent.createEl("label", { cls: "oar-moc-location-option" });
		const radio = label.createEl("input", { type: "radio", attr: { name: "niplex-moc-location", value } });
		radio.checked = this.host.settings.mocFolder === folder || (!this.host.settings.mocLocationConfigured && value === "niplex");
		label.createEl("strong", { text: title });
		label.createEl("small", { text: path });
		radio.addEventListener("change", () => {
			if (radio.checked) void this.chooseLocation(folder);
		});
	}

	private async chooseLocation(folder: string): Promise<void> {
		if (this.setupStarted) return;
		this.host.settings.mocFolder = folder;
		this.host.settings.mocLocationConfigured = true;
		this.locationSelected = true;
		await this.host.saveSettings();
		this.locationStatusEl.textContent = `Saved default location: ${folder}. MOC setup will start automatically.`;
		this.continueButton.disabled = false;
		await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
		await this.startMocSetup();
	}

	private async runSetup(status: HTMLElement, action: HTMLButtonElement): Promise<void> {
		const geminiReady = Boolean(this.host.getSecret("oar-gemini-api-key"));
		const agnesReady = Boolean(this.host.getSecret("oar-agnes-api-key"));
		const providerStatus = geminiReady || agnesReady ? "at least one provider key is stored securely" : "no provider key is stored yet; add one in plugin settings";
		const messages = [
			"1/4 Preparing the local workspace…",
			"2/4 Checking Niplex Skills Helper and Iconize…",
			`3/4 Provider check complete: ${providerStatus}.`,
			this.host.settings.mocLocationConfigured ? `4/4 Existing MOC location: ${this.host.settings.mocFolder}.` : "4/4 Choose a MOC location below to continue.",
		];
		for (const message of messages) {
			await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
			if (!status.isConnected) return;
			status.textContent = message;
		}
					action.disabled = false;
			action.textContent = this.host.settings.companionSetupConfirmed ? "Setup checks complete" : "Review important companions";
			if (this.host.settings.mocLocationConfigured) this.locationSelected = true;
			if (!this.host.settings.companionSetupConfirmed) {
				await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
				this.host.openCompanionInstaller("first-install");
			}

	}

	private async startMocSetup(): Promise<void> {
		if (this.setupStarted || (!this.locationSelected && !this.host.settings.mocLocationConfigured)) {
			new Notice("Choose a moc storage location first.");
			return;
		}
		this.setupStarted = true;
		this.continueButton.disabled = true;
		this.locationStatusEl.textContent = "Starting moc setup now. Keep the next setup window open; you may minimize it, but do not close it until complete.";
		this.host.openMocBuilder(true);
		await this.finish("Location saved. MOC setup started; keep its window open until it completes.");
	}

	private async finish(message: string): Promise<void> {
		this.host.settings.onboardingVersion = WALKTHROUGH_VERSION;
		this.host.settings.onboardingCompleted = true;
		await this.host.saveSettings();
		new Notice(message, 7000);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
