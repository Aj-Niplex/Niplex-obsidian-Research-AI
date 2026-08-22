import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AgentSettings, ProviderId } from "./core/types";

export interface SettingsHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	setSecret(id: string, value: string): void;
	clearSecret(id: string): void;
	getSecret(id: string): string | null;
}

export class AgenticResearchSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host as never);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Configuration").setHeading();
		containerEl.createEl("p", {
			text: "Choose a provider and keep agent context bounded. API keys are stored with Obsidian secretstorage and are never written to plugin data.",
			cls: "oar-muted",
		});

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Provider used for agent turns.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ gemini: "Google Gemini", agnes: "Agnes AI" })
					.setValue(this.host.settings.provider)
					.onChange(async (value) => {
						this.host.settings.provider = value as ProviderId;
						await this.host.saveSettings();
						this.display();
					}),
			);

		const provider = this.host.settings.provider;
		const secretId = provider === "gemini" ? "oar-gemini-api-key" : "oar-agnes-api-key";
		new Setting(containerEl)
			.setName(`${provider === "gemini" ? "Gemini" : "Agnes"} API key`)
			.setDesc("Paste a key to store it securely. Leave empty to keep an existing key.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder(this.host.getSecret(secretId) ? "Key stored securely" : "Paste API key");
				text.onChange((value) => {
					if (value.trim()) {
						this.host.setSecret(secretId, value.trim());
						new Notice("API key stored securely.");
						text.setValue("");
					}
				});
			})
			.addButton((button) =>
				button.setButtonText("Clear").onClick(() => {
					this.host.clearSecret(secretId);
					new Notice("API key cleared.");
				}),
			);

		new Setting(containerEl)
			.setName("Gemini model")
			.setDesc("Model name used when Gemini is selected.")
			.addText((text) =>
				text.setValue(this.host.settings.geminiModel).onChange(async (value) => {
					this.host.settings.geminiModel = value.trim() || "gemini-3.6-flash";
					await this.host.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Agnes model")
			.setDesc("Model name used when agnes is selected.")
			.addText((text) =>
				text.setValue(this.host.settings.agnesModel).onChange(async (value) => {
					this.host.settings.agnesModel = value.trim() || "agnes-2.0-flash";
					await this.host.saveSettings();
			}),
			);

		new Setting(containerEl)
			.setName("Maximum agent steps")
			.setDesc("Hard cap on tool-loop iterations per prompt.")
			.addText((text) =>
				text.setValue(String(this.host.settings.maxIterations)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed)) {
						this.host.settings.maxIterations = Math.min(Math.max(parsed, 1), 30);
						await this.host.saveSettings();
					}
			}),
			);

		new Setting(containerEl)
			.setName("Maximum read lines")
			.setDesc("Maximum lines returned by one read_file_chunk call.")
			.addText((text) =>
				text.setValue(String(this.host.settings.maxReadLines)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed)) {
						this.host.settings.maxReadLines = Math.min(Math.max(parsed, 20), 500);
						await this.host.saveSettings();
					}
			}),
			);
	}
}
