import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AgentSettings, ProviderId } from "./core/types";

export interface SettingsHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	setSecret(id: string, value: string): void;
	clearSecret(id: string): void;
	getSecret(id: string): string | null;
	getModelCatalogue(provider: ProviderId, forceRefresh?: boolean): Promise<Array<{ id: string; label: string }>>;
	openWalkthrough(): void;
	openDiagnostics(): void;
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
				.setName("Automatic rate-limit fallback")
				.setDesc("If the selected model returns a rate-limit or quota error, skip that model for one minute and try another model from this provider's catalogue. Obsolete models are skipped longer to prevent repeated failures. Providers are never switched silently.")
				.addToggle((toggle) => toggle.setValue(this.host.settings.autoFallbackOnRateLimit).onChange(async (value) => {
					this.host.settings.autoFallbackOnRateLimit = value;
					await this.host.saveSettings();
				}));

			const fallbackField = provider === "gemini" ? "geminiFallbackModels" : "agnesFallbackModels";
			const fallbackModels = this.host.settings[fallbackField];
			new Setting(containerEl)
				.setName(`${provider === "gemini" ? "Gemini" : "Agnes"} fallback order`)
				.setDesc("Optional comma-separated model ids to try first. The live catalogue is checked before a configured ID is used when available.")
				.addTextArea((text) => {
					text.setValue(fallbackModels.join(", "));
					text.inputEl.rows = 2;
					text.onChange(async (value) => {
						this.host.settings[fallbackField] = [...new Set(value.split(",").map((model) => model.trim()).filter(Boolean))];
						await this.host.saveSettings();
					});
				});

			new Setting(containerEl)
				.setName("Live model catalogue")
				.setDesc("Refresh the provider catalogue used for model selection and rate-limit fallback.")
				.addButton((button) => button.setButtonText("Refresh").onClick(async () => {
					try {
						const models = await this.host.getModelCatalogue(provider, true);
						new Notice(`${models.length} ${provider} model${models.length === 1 ? "" : "s"} available.`);
					} catch (error) {
						new Notice(error instanceof Error ? error.message : "Could not load the model catalogue.");
					}
				}));

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
				.setName("First-time walkthrough")
				.setDesc("Review privacy, bounded reading, moc-first navigation, fallback, and write approvals.")
				.addButton((button) => button.setButtonText("Show walkthrough").onClick(() => this.host.openWalkthrough()));

			new Setting(containerEl)
				.setName("Share diagnostics")
				.setDesc("Open redacted local logs for sharing when a run or model fallback needs troubleshooting.")
				.addButton((button) => button.setButtonText("Open logs").onClick(() => this.host.openDiagnostics()));

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
