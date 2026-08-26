import { App, Modal, Notice } from "obsidian";
import type { CompanionInstallCandidate } from "../core/companion-updater";

export type CompanionInstallMode = "first-install" | "updates" | "settings";

export interface CompanionInstallHost {
	getCompanionCandidates(mode: CompanionInstallMode): Promise<CompanionInstallCandidate[]>;
	installCompanion(candidate: CompanionInstallCandidate, enableAfterInstall: boolean): Promise<void>;
	markCompanionSetupConfirmed(): Promise<void>;
	openCommunityPlugins(): void;
}

export class CompanionInstallModal extends Modal {
	private readonly mode: CompanionInstallMode;
	private candidates: CompanionInstallCandidate[] = [];
	private busy = false;

	constructor(app: App, private readonly host: CompanionInstallHost, mode: CompanionInstallMode) {
		super(app);
		this.mode = mode;
	}

	onOpen(): void {
		this.modalEl.addClass("oar-companion-install-modal");
		void this.refresh();
	}

	private title(): string {
		if (this.mode === "first-install") return "Set up Niplex companions";
		if (this.mode === "updates") return "Niplex companion updates";
		return "Manage Niplex companions";
	}

	private description(): string {
		if (this.mode === "first-install") return "Niplex Research can install the important companion plugins after one clear confirmation. Nothing is downloaded or enabled before you confirm.";
		if (this.mode === "updates") return "New release metadata was found after Obsidian started. Review what changed, then confirm whether Niplex should download and enable the selected updates.";
		return "Review optional companion plugins, current versions, and release notes. Installation and enabling always require an explicit action.";
	}

	private async refresh(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.title() });
		contentEl.createEl("p", { text: this.description(), cls: "oar-muted" });
		const status = contentEl.createDiv({ cls: "oar-companion-install-status", attr: { "aria-live": "polite" } });
		status.textContent = "Checking installed versions and release notes…";
		try {
			this.candidates = await this.host.getCompanionCandidates(this.mode);
			status.textContent = this.candidates.length ? "Review the release notes before confirming." : "No installation is needed right now.";
			this.renderCandidates(contentEl);
		} catch (error) {
			status.textContent = error instanceof Error ? error.message : "Could not check companion releases.";
		}
	}

	private renderCandidates(parent: HTMLElement): void {
		for (const candidate of this.candidates) {
			const card = parent.createDiv({ cls: "oar-companion-install-card" });
			const heading = card.createDiv({ cls: "oar-companion-install-heading" });
			heading.createEl("strong", { text: candidate.definition.name });
			const state = candidate.latestVersion ? `Available ${candidate.latestVersion}` : "Release unavailable";
			heading.createSpan({ text: state, cls: "oar-muted" });
			card.createEl("p", { text: candidate.definition.description });
			const installed = candidate.installedVersion ? `Installed version: ${candidate.installedVersion}.` : "Not installed.";
			card.createEl("p", { text: `${installed} ${this.reasonText(candidate)}`, cls: "oar-muted" });
			if (candidate.latestRelease) {
				const notes = card.createEl("details");
				const summary = notes.createEl("summary", { text: "What changed and how it affects you" });
				summary.setAttr("aria-label", `Release notes for ${candidate.definition.name}`);
				notes.createEl("p", { text: candidate.latestRelease.body || "No release notes were provided." });
				card.createEl("a", { text: "Open full release notes", attr: { href: candidate.definition.releaseNotesUrl, target: "_blank", rel: "noopener" } });
			}
			if (this.mode === "settings") {
				const install = card.createEl("button", { text: this.buttonText(candidate), attr: { type: "button" } });
				install.disabled = this.busy || !candidate.latestRelease;
				install.addEventListener("click", () => {
					if (candidate.reason === "disabled") this.host.openCommunityPlugins();
					else void this.installOne(candidate);
				});
			}
		}
		if (this.mode !== "settings" && this.candidates.length) {
			const actions = parent.createDiv({ cls: "oar-companion-install-actions" });
			const confirm = actions.createEl("button", { text: this.mode === "first-install" ? "Confirm and install important companions" : "Confirm and install updates", cls: "mod-cta", attr: { type: "button" } });
			confirm.disabled = this.busy || this.candidates.some((candidate) => !candidate.latestRelease);
			confirm.addEventListener("click", () => void this.installAll(confirm));
			const later = actions.createEl("button", { text: "Do this later", attr: { type: "button" } });
			later.disabled = this.busy;
			later.addEventListener("click", () => this.close());
		}
	}

	private reasonText(candidate: CompanionInstallCandidate): string {
		if (candidate.reason === "missing") return "This plugin is not installed.";
		if (candidate.reason === "update") return "A newer compatible release is available.";
		return "It is installed but disabled; enable it from Obsidian Community plugins.";
	}

	private buttonText(candidate: CompanionInstallCandidate): string {
		if (candidate.reason === "missing") return "Install and enable";
		if (candidate.reason === "update") return "Update and enable";
		return "Open Community plugins";
	}

	private async installOne(candidate: CompanionInstallCandidate): Promise<void> {
		if (this.busy || !candidate.latestRelease) return;
		this.busy = true;
		try {
			await this.host.installCompanion(candidate, true);
			new Notice(`${candidate.definition.name} installed and enabled.`, 7000);
			await this.refresh();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : `Could not install ${candidate.definition.name}.`, 7000);
		} finally {
			this.busy = false;
		}
	}

	private async installAll(button: HTMLButtonElement): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		button.disabled = true;
		try {
			for (const candidate of this.candidates) {
				if (candidate.latestRelease) await this.host.installCompanion(candidate, true);
			}
			await this.host.markCompanionSetupConfirmed();
			new Notice("Important niplex companions are installed and enabled.", 7000);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : "One or more companion installs could not finish. Existing files were restored where possible.", 8000);
			button.disabled = false;
		} finally {
			this.busy = false;
		}
	}
}
