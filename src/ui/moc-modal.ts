import { App, Modal, Notice, Setting } from "obsidian";
import type { MocBuildResult, MocProgress } from "../core/moc-organizer";
import type { MocCheckpoint } from "../core/types";

export interface MocHost {
	settings: { activeMocPath: string; mocFolder: string };
	buildMocs(
		mode: "create" | "adjust",
		root: string,
		maxNotes: number,
		onProgress: (progress: MocProgress) => void,
		onlyPath?: string,
	): Promise<MocBuildResult>;
	setActiveMoc(path: string): Promise<void>;
	getMocCheckpoint(): MocCheckpoint | undefined;
	stopMocBuild(): void;
}

function rootFromActivePath(path: string, fallback: string): string {
	const slash = path.lastIndexOf("/");
	return slash > 0 ? path.slice(0, slash) : fallback;
}

export class MocModal extends Modal {
	private readonly host: MocHost;
	private readonly onDone: () => void;
	private mode: "create" | "adjust" = "create";
	private rootEl!: HTMLInputElement;
	private statusEl!: HTMLElement;
	private progressEl!: HTMLProgressElement;
	private actionButton!: HTMLButtonElement;
	private createModeButton!: HTMLButtonElement;
	private adjustModeButton!: HTMLButtonElement;
	private stopButton!: HTMLButtonElement;
	private busy = false;
	private paused = false;
	private readonly autoStart: boolean;

	constructor(app: App, host: MocHost, onDone: () => void, autoStart = false) {
		super(app);
		this.host = host;
		this.onDone = onDone;
		this.autoStart = autoStart;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-moc-modal");
		contentEl.createEl("h2", { text: "Map of content organizer" });
		contentEl.createEl("p", {
			text: "The model finds useful categories from note properties and a bounded excerpt. Notes may belong to more than one category.",
			cls: "oar-muted",
		});

		const mode = contentEl.createDiv({ cls: "oar-moc-mode" });
		this.createModeButton = mode.createEl("button", { text: "Discover categories" });
		this.adjustModeButton = mode.createEl("button", { text: "Adjust latest note" });
		this.createModeButton.addEventListener("click", () => {
			if (!this.busy) {
				this.mode = "create";
				this.renderBody();
			}
		});
		this.adjustModeButton.addEventListener("click", () => {
			if (!this.busy) {
				this.mode = "adjust";
				this.renderBody();
			}
		});
		this.renderBody();
		if (this.autoStart) window.setTimeout(() => void this.run(), 180);
	}

	private renderBody(): void {
		this.contentEl.querySelector(".oar-moc-body")?.remove();
		this.createModeButton.toggleClass("mod-cta", this.mode === "create");
		this.adjustModeButton.toggleClass("mod-cta", this.mode === "adjust");
		const body = this.contentEl.createDiv({ cls: "oar-moc-body" });
		new Setting(body)
			.setName("Map folder")
				.setDesc("Generated category notes and the super-map are kept under this vault-relative folder. Keep this setup window open while the build runs; minimizing it is fine.")
			.addText((text) => {
				this.rootEl = text.inputEl;
				text.setValue(rootFromActivePath(this.host.settings.activeMocPath, this.host.settings.mocFolder));
				text.setDisabled(this.busy);
			});
					const scopeNote = body.createDiv({ cls: "oar-moc-scope-note" });
			scopeNote.createEl("strong", { text: this.mode === "create" ? "Full eligible vault discovery" : "One-note adjustment" });
			scopeNote.createEl("p", { text: this.mode === "create" ? "The organizer processes every eligible Markdown note sequentially. Each model request receives only frontmatter, metadata, and a bounded excerpt; no vault-wide body is uploaded in one call." : "Only the most recently edited eligible note is reclassified, while existing category links are retained." });



		const explanation = body.createDiv({ cls: "oar-moc-explanation" });
		explanation.createEl("strong", { text: "Output structure" });
			explanation.createEl("p", { text: "The selected folder receives model-selected category notes and mocs super.md. Each category explains what belongs inside it, and the super-map recommends category combinations for better answers." });
		const tree = body.createEl("pre", { cls: "oar-moc-tree" });
		tree.textContent = `${this.rootEl?.value.trim() || this.host.settings.mocFolder}/\n├── <model-selected category>.md\n├── <another category>.md\n└── MOCs super.md`;

		this.progressEl = body.createEl("progress", { cls: "oar-moc-progress" });
		this.progressEl.max = 1;
		this.progressEl.value = 0;
		const checkpoint = this.host.getMocCheckpoint();
		const canResume = checkpoint?.mode === this.mode && checkpoint.rootPath === (this.rootEl?.value.trim() || "MOCs").replace(/^\/+|\/+$/g, "");
		this.statusEl = body.createDiv({ cls: "oar-moc-status oar-muted", text: canResume ? `Checkpoint ready: ${checkpoint?.processedPaths.length ?? 0} note(s) already classified. Continue when ready.` : this.mode === "create" ? "Ready to discover categories." : "Ready to adjust the latest edited note." });
		this.actionButton = body.createEl("button", {
			text: canResume ? "Continue from checkpoint" : this.mode === "create" ? "Discover all eligible categories" : "Adjust with latest note",
			cls: "mod-cta",
		});
		this.actionButton.addEventListener("click", () => void this.run());
		this.stopButton = body.createEl("button", { text: "Pause after current note", cls: "oar-moc-stop-button is-hidden" });
		this.stopButton.addEventListener("click", () => {
			if (!this.busy) return;
			this.stopButton.disabled = true;
			this.stopButton.textContent = "Pausing after current note…";
			this.host.stopMocBuild();
		});
	}

	private async run(): Promise<void> {
		if (this.busy) return;
		const root = this.rootEl?.value.trim() || this.host.settings.mocFolder;
		const limit = this.mode === "adjust" ? 1 : 0;
		this.busy = true;
		this.paused = false;
		this.actionButton.addClass("is-loading");
		this.stopButton.removeClass("is-hidden");
		this.stopButton.disabled = false;
		this.stopButton.textContent = "Pause after current note";
		this.actionButton.textContent = this.mode === "create" ? "Discovering categories…" : "Adjusting latest note…";
		this.actionButton.disabled = true;
		this.createModeButton.disabled = true;
		this.adjustModeButton.disabled = true;
		this.progressEl.value = 0;
		this.statusEl.textContent = this.mode === "create" ? "Starting one-note-at-a-time discovery…" : "Finding the latest edited note…";
		try {
			const result = await this.host.buildMocs(this.mode, root, limit, (progress) => this.showProgress(progress));
			this.showResult(result);
			if (result.ok) {
					await this.host.setActiveMoc(result.superPath);
					this.onDone();
					this.close();
				} else if (result.paused) {
					this.paused = true;
				}
		} catch (error) {
			this.statusEl.textContent = error instanceof Error ? error.message : "MOC generation failed.";
			new Notice(this.statusEl.textContent.slice(0, 180), 7000);
		} finally {
			this.busy = false;
			this.actionButton.removeClass("is-loading");
			this.actionButton.textContent = this.paused ? "Continue from checkpoint" : this.mode === "create" ? "Discover categories incrementally" : "Adjust with latest note";
			this.actionButton.disabled = false;
			this.stopButton.addClass("is-hidden");
			this.stopButton.disabled = false;
			this.createModeButton.disabled = false;
			this.adjustModeButton.disabled = false;
		}
	}

	private showProgress(progress: MocProgress): void {
		this.progressEl.max = Math.max(progress.total, 1);
		this.progressEl.value = Math.min(progress.current, progress.total);
		const text = progress.path ? `${progress.message} · ${progress.path}` : progress.message;
		this.statusEl.textContent = text.length > 420 ? `${text.slice(0, 420)}…` : text;
	}

	private showResult(result: MocBuildResult): void {
		const summary = result.content.length > 900 ? `${result.content.slice(0, 900)}…` : result.content;
		this.statusEl.textContent = summary;
		const notice = result.ok ? `MOC complete: ${result.notesProcessed} note(s), ${result.categories} categor${result.categories === 1 ? "y" : "ies"}.` : result.paused ? `MOC paused after ${result.notesProcessed} note(s). Continue from checkpoint.` : `MOC stopped: ${result.content.slice(0, 180)}`;
		new Notice(notice, 7000);
	}

	onClose(): void {
		if (this.busy) this.host.stopMocBuild();
		this.contentEl.empty();
	}
}
