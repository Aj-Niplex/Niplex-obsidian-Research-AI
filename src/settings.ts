import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AgentSettings, ProviderId } from "./core/types";
import { sanitizeVaultPath } from "./core/path-utils";
import { ApprovalPolicyModal, type ApprovalPolicyHost } from "./ui/approval-policy-modal";

type SettingDefinitionItem = {
	type?: "group";
	heading?: string;
	name?: string;
	desc?: string;
	searchable?: boolean;
	render?: (setting: Setting) => void;
	items?: SettingDefinitionItem[];
};

export interface SettingsHost extends ApprovalPolicyHost {
	settings: AgentSettings;
	saveSettings(): Promise<void>;
	setSecret(id: string, value: string): void;
	clearSecret(id: string): void;
	getSecret(id: string): string | null;
	getModelCatalogue(provider: ProviderId, forceRefresh?: boolean): Promise<Array<{ id: string; label: string }>>;
	openWalkthrough(): void;
	openDiagnostics(): void;
	openPrompts(): void;
}

export class AgenticResearchSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host as never);
	}

	/**
	 * Obsidian 1.13+ uses this declarative surface for settings search and
	 * rendering. The render callbacks remain imperative because this tab has
	 * provider-dependent controls, SecretStorage-backed keys, and approval
	 * actions that cannot be represented by a plain settings key binding.
	 * Older hosts ignore this method and continue using display().
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const host = this.host;
		const textSetting = (
			name: string,
			desc: string,
			value: string,
			onChange: (next: string) => void | Promise<void>,
		): SettingDefinitionItem => ({
			name,
			desc,
			render: (setting) => {
				setting.setName(name).setDesc(desc).addText((text) => {
					text.setValue(value).onChange((next) => {
						void onChange(next);
					});
				});
			},
		});

		const actionSetting = (
			name: string,
			desc: string,
			buttonText: string,
			action: () => void,
		): SettingDefinitionItem => ({
			name,
			desc,
			render: (setting) => {
				setting
					.setName(name)
					.setDesc(desc)
					.addButton((button) => button.setButtonText(buttonText).onClick(action));
			},
		});

		return [
			{
				type: "group",
				heading: "Provider",
				items: [
					{
						name: "Provider",
						desc: "Provider used for agent turns.",
						render: (setting) => {
							setting
								.setName("Provider")
								.setDesc("Provider used for agent turns.")
								.addDropdown((dropdown) =>
									dropdown
										.addOptions({ gemini: "Google Gemini", agnes: "Agnes AI" })
										.setValue(host.settings.provider)
										.onChange(async (value) => {
											host.settings.provider = value as ProviderId;
											await host.saveSettings();
										}),
								);
						},
					},
					{
						name: "Gemini API key",
						desc: "Paste a key to store it securely. Leave empty to keep an existing key.",
						render: (setting) => {
							const secretId = "oar-gemini-api-key";
							setting
								.setName("Gemini API key")
								.setDesc("Add the key for this provider. It is stored securely and never saved in plugin data.")
								.addText((text) => {
									text.inputEl.type = "password";
									text.setPlaceholder(host.getSecret(secretId) ? "Key stored securely" : "Paste API key");
									text.onChange((value) => {
										if (value.trim()) {
											host.setSecret(secretId, value.trim());
											new Notice("API key stored securely.");
											text.setValue("");
										}
									});
								})
								.addButton((button) =>
									button.setButtonText("Clear").onClick(() => {
										host.clearSecret(secretId);
										new Notice("API key cleared.");
									}),
								);
						},
					},
					{
						name: "Agnes API key",
						desc: "Paste a key to store it securely. Leave empty to keep an existing key.",
						render: (setting) => {
							const secretId = "oar-agnes-api-key";
							setting
								.setName("Agnes API key")
								.setDesc("Add the key for this provider. It is stored securely and never saved in plugin data.")
								.addText((text) => {
									text.inputEl.type = "password";
									text.setPlaceholder(host.getSecret(secretId) ? "Key stored securely" : "Paste API key");
									text.onChange((value) => {
										if (value.trim()) {
											host.setSecret(secretId, value.trim());
											new Notice("API key stored securely.");
											text.setValue("");
										}
									});
								})
								.addButton((button) =>
									button.setButtonText("Clear").onClick(() => {
										host.clearSecret(secretId);
										new Notice("API key cleared.");
									}),
								);
						},
					},
					{
						name: "Automatic rate-limit fallback",
						desc: "If the selected model returns a rate-limit or quota error, skip that model for one minute and try another model from this provider's catalogue.",
						render: (setting) => {
							setting
								.setName("Automatic rate-limit fallback")
								.setDesc("If the selected model returns a rate-limit or quota error, skip that model for one minute and try another model from this provider's catalogue.")
								.addToggle((toggle) =>
									toggle.setValue(host.settings.autoFallbackOnRateLimit).onChange(async (value) => {
										host.settings.autoFallbackOnRateLimit = value;
										await host.saveSettings();
									}),
								);
						},
					},
					textSetting(
						"Gemini model",
						"Model name used when Gemini is selected.",
						host.settings.geminiModel,
						async (value) => {
							host.settings.geminiModel = value.trim() || "gemini-3.6-flash";
							await host.saveSettings();
						},
					),
					textSetting(
						"Agnes model",
						"Model name used when Agnes is selected.",
						host.settings.agnesModel,
						async (value) => {
							host.settings.agnesModel = value.trim() || "agnes-2.0-flash";
							await host.saveSettings();
						},
					),
					{
						name: "Live model catalogue",
						desc: "Refresh the provider catalogue used for model selection and fallback.",
						render: (setting) => {
							setting
								.setName("Live model catalogue")
								.setDesc("Refresh the provider catalogue used for model selection and fallback.")
								.addButton((button) => button.setButtonText("Refresh").onClick(async () => {
									try {
										const models = await host.getModelCatalogue(host.settings.provider, true);
										new Notice(`${models.length} model${models.length === 1 ? "" : "s"} available.`);
									} catch (error) {
										new Notice(error instanceof Error ? error.message : "Could not load the model catalogue.");
									}
								}));
						},
					},
				],
			},
			{
				type: "group",
				heading: "Research controls",
				items: [
					{
						name: "System prompts",
						desc: "View the protected built-in prompt and edit your additive custom system prompt.",
						render: (setting) => {
							setting
								.setName("System prompts")
								.setDesc("View the protected prompt and edit your additional instructions.")
								.addButton((button) => button.setButtonText("Open prompt settings").onClick(() => host.openPrompts()));
						},
					},
					actionSetting(
						"First-time walkthrough",
						"Review privacy, bounded reading, MOC-first navigation, fallback, and write approvals.",
						"Show walkthrough",
						() => host.openWalkthrough(),
					),
					actionSetting(
						"Share diagnostics",
						"Open redacted local logs for sharing when a run or model fallback needs troubleshooting.",
						"Open logs",
						() => host.openDiagnostics(),
					),
				],
			},
			{
				type: "group",
				heading: "Workspace and approvals",
				items: [
					{
						name: "Edit approval policy",
						desc: "Always ask before edits, or configure a short scoped approval window.",
						render: (setting) => {
							setting
								.setName("Edit approval policy")
								.setDesc(host.settings.writeApprovalPolicy.mode === "timed" ? `Scoped approvals expire ${new Date(host.settings.writeApprovalPolicy.expiresAt).toLocaleTimeString()}; all other edits still ask.` : "Always ask before edits. Configure a short, scoped window only when you explicitly want it.")
								.addButton((button) => button.setButtonText("Configure approvals").onClick(() => new ApprovalPolicyModal(this.app, host).open()));
						},
					},
					textSetting(
						"MOC folder",
						"Generated category maps are saved under this visible vault folder.",
						host.settings.mocFolder,
						async (value) => {
							const safe = sanitizeVaultPath(value);
								if (safe) {
									host.settings.mocFolder = safe;
									host.settings.mocLocationConfigured = true;
									await host.saveSettings();
								}
						},
					),
				],
			},
			{
				type: "group",
				heading: "Limits",
				items: [
					textSetting(
						"MOC foreground time budget (seconds)",
						"Pause a long MOC build at a safe note boundary after this many seconds.",
						String(host.settings.mocTimeBudgetSeconds),
						async (value) => {
							const parsed = Number.parseInt(value, 10);
							if (Number.isFinite(parsed)) {
								host.settings.mocTimeBudgetSeconds = Math.min(Math.max(parsed, 30), 900);
								await host.saveSettings();
							}
						},
					),
					textSetting(
						"Maximum agent steps",
						"Hard cap on tool-loop iterations per prompt.",
						String(host.settings.maxIterations),
						async (value) => {
							const parsed = Number.parseInt(value, 10);
							if (Number.isFinite(parsed)) {
								host.settings.maxIterations = Math.min(Math.max(parsed, 1), 30);
								await host.saveSettings();
							}
						},
					),
					textSetting(
						"Maximum read lines",
						"Maximum lines returned by one read_file_chunk call.",
						String(host.settings.maxReadLines),
						async (value) => {
							const parsed = Number.parseInt(value, 10);
							if (Number.isFinite(parsed)) {
								host.settings.maxReadLines = Math.min(Math.max(parsed, 20), 500);
								await host.saveSettings();
							}
						},
					),
				],
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Configuration").setHeading();
		containerEl.createEl("p", {
			text: "Choose a provider. Keys stay secure; vault context stays bounded.",
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
			.setDesc("Add the key for this provider. It is stored securely and never saved in plugin data.")
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
				.setDesc("When a model is limited, pause it and try another model from the same provider.")
				.addToggle((toggle) => toggle.setValue(this.host.settings.autoFallbackOnRateLimit).onChange(async (value) => {
					this.host.settings.autoFallbackOnRateLimit = value;
					await this.host.saveSettings();
				}));

			const fallbackField = provider === "gemini" ? "geminiFallbackModels" : "agnesFallbackModels";
			const fallbackModels = this.host.settings[fallbackField];
			new Setting(containerEl)
				.setName(`${provider === "gemini" ? "Gemini" : "Agnes"} fallback order`)
				.setDesc("Optional comma-separated models to try first.")
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
				.setDesc("Refresh available models for the picker and fallback.")
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
			.setDesc("Model used when Gemini is selected.")
			.addText((text) =>
				text.setValue(this.host.settings.geminiModel).onChange(async (value) => {
					this.host.settings.geminiModel = value.trim() || "gemini-3.6-flash";
					await this.host.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Agnes model")
			.setDesc("Model used when agnes is selected.")
			.addText((text) =>
				text.setValue(this.host.settings.agnesModel).onChange(async (value) => {
					this.host.settings.agnesModel = value.trim() || "agnes-2.0-flash";
					await this.host.saveSettings();
			}),
			);

			new Setting(containerEl)
				.setName("System prompts")
				.setDesc("View the protected prompt and edit your additional instructions.")
				.addButton((button) => button.setButtonText("Open prompt settings").onClick(() => this.host.openPrompts()));

			new Setting(containerEl)
				.setName("Edit approval policy")
				.setDesc(this.host.settings.writeApprovalPolicy.mode === "timed" ? `Temporary approval ends at ${new Date(this.host.settings.writeApprovalPolicy.expiresAt).toLocaleTimeString()}.` : "Ask before every edit. You can set a short approval window.")
				.addButton((button) => button.setButtonText("Configure approvals").onClick(() => new ApprovalPolicyModal(this.app, this.host).open()));

			new Setting(containerEl)
				.setName("Moc folder")
				.setDesc("Folder where generated maps are saved.")
				.addText((text) => text.setValue(this.host.settings.mocFolder).onChange(async (value) => {
					const safe = sanitizeVaultPath(value);
						if (safe) {
							this.host.settings.mocFolder = safe;
							this.host.settings.mocLocationConfigured = true;
							await this.host.saveSettings();
						}
				}));

			new Setting(containerEl)
				.setName("First-time walkthrough")
				.setDesc("Review privacy, bounded reading, maps, fallback, and approvals.")
				.addButton((button) => button.setButtonText("Show walkthrough").onClick(() => this.host.openWalkthrough()));

			new Setting(containerEl)
				.setName("Share diagnostics")
				.setDesc("Open local logs with secrets and vault content removed.")
				.addButton((button) => button.setButtonText("Open logs").onClick(() => this.host.openDiagnostics()));

			new Setting(containerEl)
				.setName("Moc foreground time budget (seconds)")
				.setDesc("Pause a long map build after this time at a safe note boundary.")
				.addText((text) => text.setValue(String(this.host.settings.mocTimeBudgetSeconds)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed)) {
						this.host.settings.mocTimeBudgetSeconds = Math.min(Math.max(parsed, 30), 900);
						await this.host.saveSettings();
					}
				}));

			new Setting(containerEl)
				.setName("Maximum agent steps")
			.setDesc("Maximum safe actions for one question.")
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
			.setDesc("Maximum lines returned from one note read.")
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
