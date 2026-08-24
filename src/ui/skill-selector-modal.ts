import { App, Modal, Notice } from "obsidian";
import type { InstalledSkill, OutputSize } from "../core/types";

export interface SkillSelection {
	codes: string[];
	outputSize: OutputSize;
}

export interface SkillSelectorHost {
	getInstalledSkills(): Promise<InstalledSkill[]>;
	settings: { outputSize: OutputSize };
}

const BUILT_IN_SKILLS: InstalledSkill[] = [
	{
		code: "VAULT1",
		name: "Use my vault first",
		version: "built-in",
		description: "Look at the most relevant notes first, use them as the main evidence, and say clearly when your vault does not have the answer.",
		prompt: "Prefer relevant bounded vault notes as the primary evidence for this request. Do not invent vault facts, and clearly separate vault evidence from general knowledge.",
		settingsPatch: {},
	},
	{
		code: "DUMB1",
		name: "Keep outside knowledge small",
		version: "built-in",
		description: "Keep general web knowledge brief and use your selected vault notes as the main dataset instead of guessing from the real world.",
		prompt: "Use general real-world knowledge only to explain or connect the user’s bounded vault evidence. Do not treat outside knowledge as a substitute for reading relevant vault notes.",
		settingsPatch: {},
	},
];

const OUTPUT_OPTIONS: Array<{ value: OutputSize; label: string; description: string }> = [
		{ value: "lowest", label: "Lowest", description: "A few sentences with the direct answer" },
		{ value: "low", label: "Low", description: "Short answer plus the most important evidence" },
		{ value: "standard", label: "Standard", description: "Balanced answer for everyday research" },
		{ value: "high", label: "High", description: "More detail, sources, and limitations" },
		{ value: "maximum", label: "Maximum", description: "The fullest answer within safe context limits" },
];

export class SkillSelectorModal extends Modal {
	private readonly selected: Set<string>;
	private readonly host: SkillSelectorHost;
	private outputSize: OutputSize;
	private listEl!: HTMLElement;
	private outputSelect!: HTMLSelectElement;

	constructor(app: App, host: SkillSelectorHost, selectedCodes: string[], private readonly onApply: (selection: SkillSelection) => void) {
		super(app);
		this.host = host;
		this.selected = new Set(selectedCodes);
		this.outputSize = host.settings.outputSize;
	}

	onOpen(): void {
		this.modalEl.addClass("oar-skill-selector-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oar-modal", "oar-skill-selector");
		contentEl.createEl("h2", { text: "Choose skills for this chat" });
		contentEl.createEl("p", {
			text: "Choose what kind of help you want. Skills guide the answer; they do not replace the safety policy, read protected folders, reveal secrets, or bypass approvals.",
			cls: "oar-muted",
		});

		const output = contentEl.createDiv({ cls: "oar-skill-output-control" });
		output.createEl("label", { text: "How much detail should the answer contain?" });
		this.outputSelect = output.createEl("select", { attr: { "aria-label": "Answer size" } });
		for (const option of OUTPUT_OPTIONS) this.outputSelect.add(new Option(`${option.label} · ${option.description}`, option.value));
		this.outputSelect.value = this.outputSize;
		this.outputSelect.addEventListener("change", () => {
			const value = this.outputSelect.value as OutputSize;
			if (OUTPUT_OPTIONS.some((option) => option.value === value)) this.outputSize = value;
		});

		this.listEl = contentEl.createDiv({ cls: "oar-skill-selector-list" });
		void this.renderSkills();
		const actions = contentEl.createDiv({ cls: "oar-modal-actions" });
		actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
		actions.createEl("button", { text: "Use selected skills", cls: "mod-cta", attr: { type: "button" } }).addEventListener("click", () => {
			this.onApply({ codes: [...this.selected], outputSize: this.outputSize });
			new Notice(`${this.selected.size} skill${this.selected.size === 1 ? "" : "s"} selected.`, 4000);
			this.close();
		});
	}

	private async renderSkills(): Promise<void> {
		this.listEl.empty();
		this.listEl.createDiv({ text: "Loading installed skills…", cls: "oar-muted" });
		let installed: InstalledSkill[] = [];
		try {
			installed = await this.host.getInstalledSkills();
		} catch {
			// Built-in skills remain available if the vault is temporarily unavailable.
		}
		if (!this.listEl.isConnected) return;
		this.listEl.empty();
		const skills = [...BUILT_IN_SKILLS, ...installed.filter((skill) => !BUILT_IN_SKILLS.some((builtIn) => builtIn.code === skill.code))];
		if (!skills.length) {
			this.listEl.createDiv({ text: "No Helper skills are installed yet. Install one in Niplex Skills Helper, then type /skill again to refresh this list.", cls: "oar-muted" });
			return;
		}
		for (const skill of skills) {
			const label = this.listEl.createEl("label", { cls: "oar-skill-option" });
			const checkbox = label.createEl("input", { type: "checkbox", attr: { value: skill.code } });
			checkbox.checked = this.selected.has(skill.code);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) this.selected.add(skill.code);
				else this.selected.delete(skill.code);
			});
			const copy = label.createDiv({ cls: "oar-skill-option-copy" });
			copy.createEl("strong", { text: `${skill.name} · ${skill.code}` });
			copy.createEl("small", { text: `${skill.version} · What it does: ${skill.description}` });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
