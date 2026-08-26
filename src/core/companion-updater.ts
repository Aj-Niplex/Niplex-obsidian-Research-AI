import { App, TFile, requestUrl } from "obsidian";
import type { CompanionPluginDefinition } from "./companion-plugins";
import { normalizeVersion } from "./version-utils";

const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"] as const;
const ALLOWED_DOWNLOAD_HOSTS = new Set(["github.com", "objects.githubusercontent.com"]);
const GITHUB_REPOSITORY_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases\/latest\/?$/;

export type ReleaseAssetName = (typeof RELEASE_ASSETS)[number];

export interface CompanionRelease {
	version: string;
	tagName: string;
	name: string;
	body: string;
	publishedAt: string | null;
	assets: Record<ReleaseAssetName, string>;
}

export interface CompanionInstallCandidate {
	definition: CompanionPluginDefinition;
	installed: boolean;
	enabled: boolean;
	installedVersion?: string;
	latestVersion?: string;
	latestRelease?: CompanionRelease;
	reason: "missing" | "update" | "disabled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function releaseApiUrl(definition: CompanionPluginDefinition): string {
	const match = GITHUB_REPOSITORY_URL.exec(definition.manualInstallUrl);
	if (!match?.[1]) throw new Error(`No allowlisted GitHub repository is configured for ${definition.id}.`);
	return `https://api.github.com/repos/${match[1]}/releases/latest`;
}

function safeAssetUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && ALLOWED_DOWNLOAD_HOSTS.has(url.hostname) ? url.toString() : null;
	} catch {
		return null;
	}
}

export async function fetchLatestCompanionRelease(definition: CompanionPluginDefinition): Promise<CompanionRelease> {
	const response = await requestUrl({
		url: releaseApiUrl(definition),
		method: "GET",
		headers: { Accept: "application/vnd.github+json", "User-Agent": "Niplex-Research-AI" },
	});
	if (response.status < 200 || response.status >= 300) throw new Error(`Could not check ${definition.name} releases (HTTP ${response.status}).`);
	const raw = parseJson(response.text);
	if (!isRecord(raw) || typeof raw.tag_name !== "string" || !Array.isArray(raw.assets)) throw new Error(`GitHub returned an invalid release record for ${definition.name}.`);
	const version = normalizeVersion(raw.tag_name);
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`GitHub returned an invalid version for ${definition.name}.`);
	const assets: Partial<Record<ReleaseAssetName, string>> = {};
	for (const rawAsset of raw.assets) {
		if (!isRecord(rawAsset) || typeof rawAsset.name !== "string") continue;
		if (!RELEASE_ASSETS.includes(rawAsset.name as ReleaseAssetName)) continue;
		const url = safeAssetUrl(rawAsset.browser_download_url);
		if (url) assets[rawAsset.name as ReleaseAssetName] = url;
	}
	if (!RELEASE_ASSETS.every((name) => Boolean(assets[name]))) throw new Error(`${definition.name} release ${version} does not contain the required main.js, manifest.json, and styles.css assets.`);
	return {
		version,
		tagName: raw.tag_name,
		name: typeof raw.name === "string" ? raw.name.slice(0, 160) : `${definition.name} ${version}`,
		body: typeof raw.body === "string" ? raw.body.slice(0, 4000) : "No release notes were provided.",
		publishedAt: typeof raw.published_at === "string" ? raw.published_at : null,
		assets: assets as Record<ReleaseAssetName, string>,
	};
}

async function downloadText(url: string, label: string): Promise<string> {
	const response = await requestUrl({
		url,
		method: "GET",
		headers: { Accept: "application/octet-stream", "User-Agent": "Niplex-Research-AI" },
	});
	if (response.status < 200 || response.status >= 300) throw new Error(`Could not download ${label} (HTTP ${response.status}).`);
	return response.text;
}

export function getCompanionPluginPath(app: App, pluginId: string): string {
	const configuredDir = typeof app.vault.configDir === "string" ? app.vault.configDir.trim().replace(/^\/+|\/+$/g, "") : "";
	const configDir = configuredDir || ".obsidian";
	return `${configDir}/plugins/${pluginId}`;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split("/");
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
	}
}

function validManifest(value: unknown, definition: CompanionPluginDefinition, release: CompanionRelease): boolean {
	return isRecord(value) && value.id === definition.id && typeof value.name === "string" && typeof value.version === "string" && normalizeVersion(value.version) === release.version;
}

export async function installCompanionRelease(app: App, candidate: CompanionInstallCandidate, enableAfterInstall: boolean): Promise<void> {
	const release = candidate.latestRelease;
	if (!release) throw new Error(`No verified release is available for ${candidate.definition.name}. Open Community plugins for a manual install.`);
	const downloaded = new Map<ReleaseAssetName, string>();
	for (const name of RELEASE_ASSETS) downloaded.set(name, await downloadText(release.assets[name], `${candidate.definition.name} ${name}`));
	const manifestText = downloaded.get("manifest.json") ?? "";
	if (!validManifest(parseJson(manifestText), candidate.definition, release)) throw new Error(`The downloaded ${candidate.definition.name} manifest did not match its allowlisted plugin identity and release version.`);
	const pluginPath = getCompanionPluginPath(app, candidate.definition.id);
	await ensureFolder(app, pluginPath);
	const previous = new Map<ReleaseAssetName, string | null>();
	const created = new Set<ReleaseAssetName>();
	for (const name of RELEASE_ASSETS) {
		const existing = app.vault.getAbstractFileByPath(`${pluginPath}/${name}`);
		if (existing instanceof TFile) previous.set(name, await app.vault.read(existing));
		else previous.set(name, null);
	}
	const pluginManager = (app as unknown as { plugins?: { enabledPlugins?: Set<string>; loadManifests?: () => Promise<void> | void; disablePlugin?: (id: string) => Promise<void>; enablePlugin?: (id: string) => Promise<void> } }).plugins;
	const wasEnabled = Boolean(pluginManager?.enabledPlugins?.has(candidate.definition.id));
	try {
		if (wasEnabled && pluginManager?.disablePlugin) await pluginManager.disablePlugin(candidate.definition.id);
		for (const name of RELEASE_ASSETS) {
			const path = `${pluginPath}/${name}`;
			const existing = app.vault.getAbstractFileByPath(path);
			const text = downloaded.get(name) ?? "";
			if (existing instanceof TFile) await app.vault.modify(existing, text);
			else {
				await app.vault.create(path, text);
				created.add(name);
			}
		}
		if ((wasEnabled || enableAfterInstall) && pluginManager?.enablePlugin) {
			await pluginManager.loadManifests?.();
			await pluginManager.enablePlugin(candidate.definition.id);
		}
	} catch (error) {
		for (const name of RELEASE_ASSETS) {
			const path = `${pluginPath}/${name}`;
			const existing = app.vault.getAbstractFileByPath(path);
			const oldText = previous.get(name);
			try {
				if (oldText !== null && oldText !== undefined && existing instanceof TFile) await app.vault.modify(existing, oldText);
				else if (created.has(name) && existing) await app.fileManager.trashFile(existing);
			} catch {
				// Preserve the original installation error; the user can restore the plugin files manually.
			}
		}
		if (wasEnabled && pluginManager?.enablePlugin) {
			try { await pluginManager.enablePlugin(candidate.definition.id); } catch { /* The original error remains actionable. */ }
		}
		throw error;
	}
}
