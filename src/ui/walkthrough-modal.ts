import { App, Modal, Notice } from "obsidian";
import type { AgentSettings } from "../core/types";

export const WALKTHROUGH_VERSION = 5;

export interface WalkthroughHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	getSecret(id: string): string | null;
	openMocBuilder(autoStart?: boolean): void;
}

const MOC_ROOT = "MOCs";
const MOC_NIPLEX_ROOT = "NIPLEX-OBSIDIAN/MOCs";

export class WalkthroughModal extends Modal {
	private locationStatusEl!: HTMLElement;
	private continueButton!: HTMLButtonElement;
	private setupStarted = false;

	constructor(app: App, private readonly host: WalkthroughHost) { super(app); }

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-walkthrough-modal");
		contentEl.createEl("p", { text: "A privacy-aware research workspace for your vault", cls: "oar-walkthrough-kicker" });
		contentEl.createEl("h2", { text: "Welcome to niplex research AI" });
		contentEl.createEl("p", { text: "This plugin is standalone. No helper, icon, brain, or writing companion plugin is required.", cls: "oar-muted" });

		const setupCard = contentEl.createDiv({ cls: "oar-setup-card" });
		setupCard.createEl("strong", { text: "Standalone setup" });
		setupCard.createEl("p", { text: "Add a provider key in settings, choose where mocs belong, and start researching. Keys remain in Obsidian secretstorage.", cls: "oar-muted" });

		const locationCard = contentEl.createDiv({ cls: "oar-moc-location-card" });
		locationCard.createEl("strong", { text: "Where should mocs be stored?" });
		locationCard.createEl("p", { text: "Choose the default location for category maps and mocs super.md.", cls: "oar-muted" });
		const options = locationCard.createDiv({ cls: "oar-moc-location-options" });
		this.addLocationOption(options, "root", "Folder in vault root", "MOCs/", MOC_ROOT);
		this.addLocationOption(options, "niplex", "Under Niplex-Obsidian", "NIPLEX-OBSIDIAN/MOCs/", MOC_NIPLEX_ROOT);
		this.locationStatusEl = locationCard.createDiv({ cls: "oar-moc-location-status oar-muted", attr: { "aria-live": "polite" } });
		this.locationStatusEl.textContent = this.host.settings.mocLocationConfigured ? `Current default: ${this.host.settings.mocFolder}` : "Choose one option to continue.";

		const steps: Array<[string, string, string]> = [
			["1", "Connect a provider", "Add a Gemini or Agnes key in Settings. Keys are never written into chats, prompts, or MOCs."],
			["2", "Use bounded context", "Attach up to eight files or ask the agent to search. It does not upload your whole vault."],
			["3", "Keep your graph tidy", "Exclude NIPLEX-OBSIDIAN/ in Graph View if you do not want plugin data shown in the graph."],
			["4", "Approve edits", "Create and edit mode asks before durable changes unless you configure a scoped approval window."],
			["5", "Use MCP-compatible tools", "Provider tool calls use normalized MCP-style names, JSON arguments, and result envelopes."],
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
		const actions = footer.createDiv({ cls: "oar-walkthrough-actions" });
		this.continueButton = actions.createEl("button", { text: "Start moc setup", cls: "oar-walkthrough-moc-button mod-cta", attr: { type: "button" } });
		this.continueButton.disabled = !this.host.settings.mocLocationConfigured;
		this.continueButton.addEventListener("click", () => void this.startMocSetup());
		const skip = actions.createEl("button", { text: "Do this later", attr: { type: "button" } });
		skip.addEventListener("click", () => void this.finish("Setup saved. You can reopen it from settings."));
		const done = actions.createEl("button", { text: "Start researching", attr: { type: "button" } });
		done.addEventListener("click", () => void this.finish("Setup saved. Start with a focused research question."));
	}

	private addLocationOption(parent: HTMLElement, value: "root" | "niplex", title: string, path: string, folder: string): void {
		const label = parent.createEl("label", { cls: "oar-moc-location-option" });
		const radio = label.createEl("input", { type: "radio", attr: { name: "niplex-moc-location", value } });
		radio.checked = this.host.settings.mocFolder === folder || (!this.host.settings.mocLocationConfigured && value === "niplex");
		label.createEl("strong", { text: title });
		label.createEl("small", { text: path });
		radio.addEventListener("change", () => { if (radio.checked) void this.chooseLocation(folder); });
	}

	private async chooseLocation(folder: string): Promise<void> {
		if (this.setupStarted) return;
		this.host.settings.mocFolder = folder;
		this.host.settings.mocLocationConfigured = true;
		await this.host.saveSettings();
		this.locationStatusEl.textContent = `Saved default location: ${folder}.`;
		this.continueButton.disabled = false;
	}

	private async startMocSetup(): Promise<void> {
		if (this.setupStarted || !this.host.settings.mocLocationConfigured) { new Notice("Choose a moc storage location first."); return; }
		this.setupStarted = true;
		this.continueButton.disabled = true;
		this.host.openMocBuilder(true);
		await this.finish("Location saved. MOC setup started.");
	}

	private async finish(message: string): Promise<void> {
		this.host.settings.onboardingVersion = WALKTHROUGH_VERSION;
		this.host.settings.onboardingCompleted = true;
		await this.host.saveSettings();
		new Notice(message, 7000);
		this.close();
	}

	onClose(): void { this.contentEl.empty(); }
}
