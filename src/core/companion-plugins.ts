export type CompanionPluginId = "niplex-skills-helper" | "obsidian-icon-folder" | "niplex-research-brain" | "niplex-writing-insights";

import { compareVersions } from "./version-utils";

export interface CompanionPluginDefinition {
	id: CompanionPluginId;
	name: string;
	description: string;
	communitySearchName: string;
	manualInstallUrl: string;
	expectedVersion?: string;
	priority: "important" | "optional";
	releaseNotesUrl: string;
	required: boolean;
}

export interface CompanionPluginStatus extends CompanionPluginDefinition {
	installed: boolean;
	enabled: boolean;
	installedVersion?: string;
	upToDate: boolean;
}

export const COMPANION_PLUGINS: readonly CompanionPluginDefinition[] = [
	{
		id: "niplex-skills-helper",
		name: "Niplex Skills Helper",
		description: "Look up and preview five-character instruction-skill packages.",
		communitySearchName: "Niplex Skills Helper",
		manualInstallUrl: "https://github.com/Aj-Niplex/niplex-obsidian-helper/releases/latest",
								expectedVersion: "0.2.1",
			priority: "important",
			releaseNotesUrl: "https://github.com/Aj-Niplex/niplex-obsidian-helper/releases/latest",
			required: true,

	},
			{
			id: "obsidian-icon-folder",
			name: "Iconize",
			description: "Optional file and folder icons. Niplex Research AI does not require it for its own interface.",
			communitySearchName: "Iconize",
			manualInstallUrl: "https://github.com/FlorianWoelki/obsidian-iconize/releases/latest",
			priority: "optional",
			releaseNotesUrl: "https://github.com/FlorianWoelki/obsidian-iconize/releases/latest",
			required: false,
		},
		{
			id: "niplex-research-brain",
			name: "Niplex Research Brain",
			description: "Optional connection index and provenance-labelled research map for bounded agent context.",
			communitySearchName: "Niplex Research Brain",
			manualInstallUrl: "https://github.com/Aj-Niplex/Niplex-Research-Brain/releases/latest",
			expectedVersion: "0.2.0",
			priority: "important",
			releaseNotesUrl: "https://github.com/Aj-Niplex/Niplex-Research-Brain/releases/latest",
			required: false,
		},
		{
			id: "niplex-writing-insights",
			name: "Niplex Writing Insights",
			description: "Optional local writing heatmap and coarse activity context for the Niplex ecosystem.",
			communitySearchName: "Niplex Writing Insights",
			manualInstallUrl: "https://github.com/Aj-Niplex/Niplex-Writing-Insights/releases/latest",
						expectedVersion: "0.2.0",
			priority: "optional",
			releaseNotesUrl: "https://github.com/Aj-Niplex/Niplex-Writing-Insights/releases/latest",
			required: false,
		},
	];

function versionAtLeast(actual: string | undefined, expected: string | undefined): boolean {
	if (!expected) return true;
	if (!actual) return false;
		return compareVersions(actual, expected) >= 0;
}

export function isCompanionVersionCurrent(actual: string | undefined, expected: string | undefined): boolean {
	return versionAtLeast(actual, expected);
}

export function getCompanionDefinition(pluginId: string): CompanionPluginDefinition | null {
	return COMPANION_PLUGINS.find((plugin) => plugin.id === pluginId) ?? null;
}
