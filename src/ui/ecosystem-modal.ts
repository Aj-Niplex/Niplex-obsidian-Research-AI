import { App, Modal, Notice, Setting } from "obsidian";
import type { EcosystemPermissionGrant } from "../core/ecosystem";
import type { NiplexExtensionSummary, NiplexPermissionKey } from "../core/ecosystem";

export interface EcosystemPermissionHost {
	getEcosystemExtensions(): NiplexExtensionSummary[];
	getEcosystemPermission(extensionId: string): EcosystemPermissionGrant;
	setEcosystemPermission(extensionId: string, permission: NiplexPermissionKey, allowed: boolean): Promise<void>;
	resetEcosystemPermissions(extensionId: string): Promise<void>;
}

const PERMISSIONS: Array<{ key: NiplexPermissionKey; label: string; description: string }> = [
	{ key: "bounded-context", label: "Contribute bounded context", description: "Allow this extension to add a capped context block to relevant agent turns." },
	{ key: "note-metadata", label: "Share note metadata", description: "Allow limited paths, titles, headings, tags, or relation labels when the extension declares them." },
	{ key: "map-provenance", label: "Share map provenance", description: "Allow provenance labels and bounded source references from local maps." },
	{ key: "coarse-activity", label: "Share coarse activity", description: "Allow aggregate writing statistics such as streak, weekly minutes, and a peak-hour bucket." },
	{ key: "skill-guidance", label: "Use selected skill guidance", description: "Allow explicitly selected skill guidance as untrusted additive instructions." },
	{ key: "read-only-actions", label: "Show read-only actions", description: "Allow this extension to offer user-invoked, read-only actions in the ecosystem surface." },
];

export class EcosystemPermissionModal extends Modal {
	constructor(app: App, private readonly host: EcosystemPermissionHost) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("oar-ecosystem-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Niplex ecosystem" });
		contentEl.createEl("p", { text: "Optional niplex extensions can contribute only the data classes you explicitly allow. All grants start off, and write access is not available through this bridge.", cls: "oar-muted" });
		const extensions = this.host.getEcosystemExtensions();
		if (!extensions.length) {
			contentEl.createEl("p", { text: "No compatible niplex extensions are connected. Enable research brain or writing insights, then reopen this panel." });
			return;
		}
		for (const extension of extensions) this.renderExtension(contentEl, extension);
	}

	private renderExtension(root: HTMLElement, extension: NiplexExtensionSummary): void {
		const section = root.createDiv({ cls: "oar-ecosystem-extension" });
		section.createEl("h3", { text: extension.name });
		section.createEl("p", { text: `${extension.id} · version ${extension.version}\nCapabilities: ${extension.capabilities.join(", ")}`, cls: "oar-muted" });
		const available = new Set(extension.dataClasses);
		const grant = this.host.getEcosystemPermission(extension.id);
		for (const permission of PERMISSIONS) {
			const dataClass = permission.key === "note-metadata" || permission.key === "map-provenance" ? permission.key : permission.key === "coarse-activity" ? "coarse-activity" : permission.key === "skill-guidance" ? "skill-guidance" : null;
			if (dataClass && !available.has(dataClass)) continue;
			new Setting(section)
				.setName(permission.label)
				.setDesc(permission.description)
				.addToggle((toggle) => toggle.setValue(this.readGrant(grant, permission.key)).onChange(async (value) => {
					await this.host.setEcosystemPermission(extension.id, permission.key, value);
					new Notice(`${permission.label} ${value ? "enabled" : "disabled"} for ${extension.name}.`);
				}));
		}
		new Setting(section).addButton((button) => button.setButtonText("Reset permissions").onClick(async () => {
			await this.host.resetEcosystemPermissions(extension.id);
			new Notice(`Permissions reset for ${extension.name}.`);
			this.close();
		}));
	}

	private readGrant(grant: EcosystemPermissionGrant, key: NiplexPermissionKey): boolean {
		if (key === "bounded-context") return grant.boundedContext;
		if (key === "note-metadata") return grant.noteMetadata;
		if (key === "map-provenance") return grant.mapProvenance;
		if (key === "coarse-activity") return grant.coarseActivity;
		if (key === "skill-guidance") return grant.skillGuidance;
		return grant.readOnlyActions;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
