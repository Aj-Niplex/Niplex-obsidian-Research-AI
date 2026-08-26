export const NIPLEX_ECOSYSTEM_PROTOCOL = "niplex-ecosystem" as const;
export const NIPLEX_ECOSYSTEM_PROTOCOL_VERSION = "1.0" as const;

export type NiplexCapability =
	| "bounded-context"
	| "coarse-activity-context"
	| "skill-guidance"
	| "research-action"
	| "reflection-action";

export type NiplexDataClass =
	| "note-metadata"
	| "map-provenance"
	| "coarse-activity"
	| "skill-guidance";

export type NiplexPermissionKey =
	| "bounded-context"
	| "note-metadata"
	| "map-provenance"
	| "coarse-activity"
	| "skill-guidance"
	| "read-only-actions";

export interface EcosystemPermissionGrant {
	boundedContext: boolean;
	noteMetadata: boolean;
	mapProvenance: boolean;
	coarseActivity: boolean;
	skillGuidance: boolean;
	readOnlyActions: boolean;
}

export interface NiplexProvenance {
	label: string;
	kind: "vault" | "local-index" | "aggregate" | "user";
	path?: string;
	relation?: string;
}

export interface NiplexContextRequest {
	requestId: string;
	purpose: "agent-turn" | "map-exploration" | "reflection";
	query: string;
	maxChars: number;
	maxItems: number;
	approvedDataClasses: readonly NiplexDataClass[];
	signal?: AbortSignal;
}

export interface NiplexContextContribution {
	extensionId: string;
	label: string;
	text: string;
	dataClasses: readonly NiplexDataClass[];
	provenance: readonly NiplexProvenance[];
	truncated: boolean;
	generatedAt: number;
}

export interface NiplexActionRequest {
	requestId: string;
	purpose: "agent-turn" | "map-exploration" | "reflection";
	query: string;
	maxChars: number;
	approvedDataClasses: readonly NiplexDataClass[];
	signal?: AbortSignal;
}

export interface NiplexActionResult {
	ok: boolean;
	text: string;
	dataClasses: readonly NiplexDataClass[];
	provenance: readonly NiplexProvenance[];
}

export interface NiplexActionDefinition {
	id: string;
	label: string;
	description: string;
	readOnly: boolean;
	requiresApproval: boolean;
	run(request: NiplexActionRequest): Promise<NiplexActionResult>;
}

export interface NiplexExtension {
	id: string;
	name: string;
	version: string;
	protocol: typeof NIPLEX_ECOSYSTEM_PROTOCOL;
	protocolVersion: typeof NIPLEX_ECOSYSTEM_PROTOCOL_VERSION;
	capabilities: readonly NiplexCapability[];
	dataClasses: readonly NiplexDataClass[];
	getContext?: (request: NiplexContextRequest) => Promise<NiplexContextContribution>;
	actions?: readonly NiplexActionDefinition[];
}

export interface NiplexActionSummary {
    extensionId: string;
    actionId: string;
    label: string;
    description: string;
}

export interface NiplexExtensionSummary {
	id: string;
	name: string;
	version: string;
	capabilities: readonly NiplexCapability[];
	dataClasses: readonly NiplexDataClass[];
}

export interface NiplexRegistration {
	accepted: boolean;
	extensionId: string;
	hostPluginId: "niplex-agentic-research";
	hostVersion: string;
	protocolVersion: typeof NIPLEX_ECOSYSTEM_PROTOCOL_VERSION;
	unregister(): void;
}

export interface NiplexResearchHostApi {
	readonly protocol: typeof NIPLEX_ECOSYSTEM_PROTOCOL;
	readonly protocolVersion: typeof NIPLEX_ECOSYSTEM_PROTOCOL_VERSION;
	readonly hostPluginId: "niplex-agentic-research";
	readonly hostVersion: string;
	registerExtension(extension: NiplexExtension): NiplexRegistration;
	unregisterExtension(extensionId: string): void;
	getExtensions(): NiplexExtensionSummary[];
	getActions(): NiplexActionSummary[];
	requestExtensionContext(request: NiplexContextRequest): Promise<NiplexContextContribution[]>;
}

export function emptyEcosystemGrant(): EcosystemPermissionGrant {
	return {
		boundedContext: false,
		noteMetadata: false,
		mapProvenance: false,
		coarseActivity: false,
		skillGuidance: false,
		readOnlyActions: false,
	};
}

export function permissionAllowsDataClass(grant: EcosystemPermissionGrant, dataClass: NiplexDataClass): boolean {
	if (dataClass === "note-metadata") return grant.noteMetadata;
	if (dataClass === "map-provenance") return grant.mapProvenance;
	if (dataClass === "coarse-activity") return grant.coarseActivity;
	return grant.skillGuidance;
}

export function normalizeEcosystemContribution(
	contribution: NiplexContextContribution,
	request: NiplexContextRequest,
): NiplexContextContribution | null {
	if (!contribution.extensionId || !contribution.label || typeof contribution.text !== "string") return null;
	const requestedChars = Number.isFinite(request.maxChars) ? Math.floor(request.maxChars) : 0;
	const charLimit = Math.min(Math.max(requestedChars, 0), 12000);
	const itemLimit = Math.min(Math.max(Number.isFinite(request.maxItems) ? Math.floor(request.maxItems) : 0, 0), 24);
	const suffix = "\n…[extension context truncated]";
	let text = contribution.text;
	let truncated = contribution.truncated;
	if (text.length > charLimit) {
		truncated = true;
		text = charLimit === 0 ? "" : charLimit <= suffix.length ? suffix.slice(0, charLimit) : `${text.slice(0, charLimit - suffix.length)}${suffix}`;
	}
	if (!text.trim()) return null;
	return {
		extensionId: contribution.extensionId.slice(0, 100),
		label: contribution.label.slice(0, 120),
		text,
		dataClasses: contribution.dataClasses.slice(0, itemLimit),
		provenance: contribution.provenance.slice(0, itemLimit).map((item) => ({
			label: item.label.slice(0, 180),
			kind: item.kind,
			...(item.path ? { path: item.path.slice(0, 180) } : {}),
			...(item.relation ? { relation: item.relation.slice(0, 120) } : {}),
		})),
			truncated,
		generatedAt: Number.isFinite(contribution.generatedAt) ? contribution.generatedAt : Date.now(),
	};
}
