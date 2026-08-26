# Niplex Ecosystem Protocol v1

## Purpose

Niplex products remain separate Obsidian community plugins with independent repositories, manifests, releases, review histories, and failure domains. They communicate through an optional host-mediated contract so Research AI can use specialized capabilities from Research Brain, Writing Insights, Skills Helper, and future Niplex modules without importing another plugin’s implementation or silently sharing private data.

The approved Niplex Research AI `0.1.19` release remains unchanged. This document defines the contract for a future backward-compatible ecosystem bridge and the adapters that separate plugins can implement.

## Product roles

| Product | Role in the ecosystem | Safe contribution to Research AI | Prohibited by default |
| --- | --- | --- | --- |
| Niplex Research AI | Host agent and approval boundary | Bounded context orchestration, extension discovery, user-visible provenance, write approvals | Silent extension activation, secret sharing, unrestricted vault transfer |
| Niplex Research Brain | Connection-index provider | Focused map neighborhood, explicit links, backlinks, tags, MOC relations, optional semantic similarity | Whole-vault upload, hidden index access, automatic note writes |
| Niplex Writing Insights | Local activity signal provider | Coarse cadence context such as active-day count, streak, weekly minutes, and peak-hour bucket | Note paths, note content, exact heatmap, text diffs, automatic chat initiation |
| Niplex Skills Helper | Skill catalogue/provider | User-selected additive skill guidance and bounded settings patches | Protected-prompt replacement, unapproved code execution, secret access |
| Iconize and visual companions | Presentation helpers | Optional icons and visual affordances | Research data access or agent authority |
| Future Niplex modules | Capability-specific providers | Only declared, user-approved capability payloads | Undeclared data collection or implicit trust |

## Transport and discovery

The preferred transport is an in-process public API obtained from Obsidian’s plugin manager by plugin ID. Separate plugins use local TypeScript interfaces and runtime feature detection; no plugin imports another plugin’s compiled JavaScript. A host may expose this shape on its plugin instance:

```ts
interface NiplexResearchHostApi {
  protocol: "niplex-ecosystem";
  protocolVersion: "1.0";
  hostPluginId: "niplex-agentic-research";
  hostVersion: string;
  registerExtension(extension: NiplexExtension): NiplexRegistration;
  unregisterExtension(extensionId: string): void;
  requestExtensionContext(request: NiplexContextRequest): Promise<NiplexContextBundle>;
  runWithEcosystemContext(request: NiplexRunRequest): Promise<NiplexRunResult>;
}
```

Extensions expose their API on their plugin instance and register themselves through the host’s `registerExtension()` method. If the host is not installed, disabled, too old, or does not advertise `protocolVersion`, the extension remains functional within its own bounded UI but clearly reports `Not connected to Niplex Research AI`; it must not claim native integration.

For load-order resilience, the ecosystem may emit a non-sensitive readiness event after registration. The event contains only protocol version, host plugin ID, and host version. It never carries vault content, settings, credentials, chat messages, or activity data.

## Extension contract

```ts
type NiplexCapability =
  | "bounded-context"
  | "coarse-activity-context"
  | "skill-guidance"
  | "research-action"
  | "reflection-action";

type NiplexDataClass =
  | "note-metadata"
  | "map-provenance"
  | "coarse-activity"
  | "skill-guidance";

interface NiplexExtension {
  id: string;
  name: string;
  version: string;
  protocolVersion: "1.0";
  capabilities: readonly NiplexCapability[];
  dataClasses: readonly NiplexDataClass[];
  getContext?: (request: NiplexContextRequest) => Promise<NiplexContextContribution>;
  actions?: readonly NiplexActionDefinition[];
}

interface NiplexContextRequest {
  requestId: string;
  purpose: "agent-turn" | "map-exploration" | "reflection";
  query: string;
  maxChars: number;
  maxItems: number;
  approvedDataClasses: readonly NiplexDataClass[];
  signal?: AbortSignal;
}

interface NiplexContextContribution {
  extensionId: string;
  label: string;
  text: string;
  dataClasses: readonly NiplexDataClass[];
  provenance: readonly NiplexProvenance[];
  truncated: boolean;
  generatedAt: number;
}

interface NiplexProvenance {
  label: string;
  kind: "vault" | "local-index" | "aggregate" | "user";
  path?: string;
  relation?: string;
}

interface NiplexActionDefinition {
  id: string;
  label: string;
  description: string;
  readOnly: boolean;
  requiresApproval: boolean;
  run: (request: NiplexActionRequest) => Promise<NiplexActionResult>;
}
```

## Permission model

Permissions are explicit host-side grants stored in the user’s local plugin settings. A new extension begins with no grants. The user can enable a capability individually, revoke it, or reset all grants. Installing or enabling a plugin never grants it access to the core agent automatically.

| Permission | Default | Meaning |
| --- | --- | --- |
| Discover host | Allowed | The extension may detect whether the core host is present and compatible. |
| Contribute bounded context | Off | The host may request a bounded contribution for a user-visible agent turn. |
| Share note metadata | Off | The provider may share limited paths, titles, headings, tags, and relation labels. |
| Share map provenance | Off | Research Brain may share relation labels and bounded source references. |
| Share coarse activity | Off | Writing Insights may share aggregate counts and coarse time buckets only. |
| Add user-selected skill guidance | Off | Skills Helper may contribute selected additive instructions after user selection. |
| Provide read-only actions | Off | The extension may add a user-invoked action to the host action sheet. |
| Request write action | Always off initially | Any future write action must pass through the core’s existing approval modal and path policy. |
| Remote transfer by extension | Always off in v1 | Extensions cannot use the bridge to send data remotely. Their own provider calls remain governed by their own visible consent screens. |

The host applies a second, per-request budget even after a grant. Every contribution is capped by `maxChars` and `maxItems`, labeled with its data class, and rendered as an optional expandable context section. The host never forwards an extension payload unless the current request’s purpose and user grant both allow it.

## Product-specific adapters

### Research Brain

Research Brain registers `bounded-context` and `research-action`. For an agent turn it receives the query and a strict budget, ranks only records already present in its local index, and returns a compact research neighborhood containing relation labels such as `explicit-link`, `backlink`, `shared-tag`, `shared-moc`, or `semantic-similarity`. The contribution may include bounded note paths only when the user grants `note-metadata`; it never includes whole note bodies through this bridge. Its Gemini embedding consent remains separate and is never implied by host registration.

The user-facing Brain view retains refresh, scope, exclusion, embedding consent, and delete controls. The new integration control is a single “Connect to Niplex Research AI” section with status, permissions, and disconnect/reset actions.

### Writing Insights

Writing Insights registers `coarse-activity-context` and `reflection-action`. It can provide only a coarsened weekly summary: active-day count, streak, approximate weekly minutes, approximate character total, and a peak-hour bucket. It never provides note names, paths, content, diffs, exact per-hour heatmap cells, or API credentials. The host must show the contribution as aggregate activity context and must not automatically start an agent turn because the user is inactive.

The existing in-app reflection setting remains independent. If the user invokes the ecosystem reflection action, the host may ask the provider for a short reflection using the same aggregate-only payload and existing provider consent rules.

### Skills Helper

Skills Helper registers `skill-guidance` only for explicitly selected skill codes. The host treats returned guidance as untrusted additive instructions. It cannot alter the protected system prompt, access secrets, bypass write approvals, or change the host’s safety limits outside the existing allowlisted settings patch.

### Visual companions

Iconize and future visual companions may register presentation capabilities, but they do not receive research context. Visual integration is intentionally one-way: the host may ask them to decorate a user-visible element, never to influence agent authority.

## Agent-turn data flow

1. The user starts a Research AI turn or invokes an ecosystem action.
2. The host identifies installed, enabled, protocol-compatible extensions.
3. The host checks the user’s capability grants and the current request purpose.
4. The host creates a request ID, query budget, item budget, and abort signal.
5. Each approved provider receives only the request envelope, not credentials or full chat history.
6. Providers return bounded, typed contributions with data classes and provenance.
7. The host validates contribution size, removes undeclared fields, and rejects malformed or over-budget payloads.
8. The host displays a compact “Extension context” activity row with the provider name and provenance summary.
9. The host adds approved contributions to the bounded prompt context and preserves the existing read/write approval boundary.
10. The host records only redacted diagnostics such as provider ID, capability, item count, and truncation state.

## Failure isolation

An extension timeout, malformed payload, disabled plugin, stale protocol version, provider quota failure, or vault permission failure must not prevent the core agent from running. The host records a short diagnostic and continues without that contribution. An extension must also continue operating without the host, except for features explicitly labeled as ecosystem-only.

## Versioning and compatibility

Protocol versions use major/minor negotiation. A host supports the `1.x` contract when it can safely ignore unknown optional fields. A major mismatch disables registration and shows a repair message. Extensions must declare their minimum supported host version and must never assume private core implementation details. The existing core release remains valid because it simply does not advertise this protocol until a future bridge release is available.

## Repository and release rules

The protocol specification may live in a public Niplex ecosystem-contract repository. Each plugin keeps its own local type-only adapter and tests so its release is independently buildable and reviewable. No plugin adds a hard runtime dependency on another plugin’s repository. Each community release still contains only its own `main.js`, `manifest.json`, and `styles.css`. Core bridge work, if approved, is released as a new core version while retaining the existing `0.1.19` tag and release assets unchanged.


## External reference notes

The ecosystem design was checked against Obsidian’s public developer documentation and plugin-community discussions. The official developer reference URLs discovered for the Plugin and App TypeScript API currently resolve to a “Not found” page through the documentation extractor, so no unsupported method is being claimed from those pages. The public Obsidian forum discussions on plugin-to-plugin communication document the general pattern of exposing a public API from one plugin and retrieving it from another; the implementation here deliberately narrows that pattern with protocol/version checks, typed runtime guards, explicit permissions, bounded budgets, and failure isolation.

Sources consulted:

- https://docs.obsidian.md/Home — Obsidian Developer Documentation home.
- https://docs.obsidian.md/Reference/TypeScript+API/Plugin — official Plugin API reference URL checked; currently returned “Not found” through the public extractor.
- https://docs.obsidian.md/Reference/TypeScript+API/App — official App API reference URL checked; currently returned “Not found” through the public extractor.
- https://forum.obsidian.md/t/how-to-create-plugin-apis-for-other-plugins-to-use-plugin-to-plugin-communication/92296 — public discussion about creating plugin APIs for other plugins.
- https://forum.obsidian.md/t/inter-plugin-communication-expose-api-to-other-plugins/23618 — public discussion about exposing plugin APIs and custom events.
