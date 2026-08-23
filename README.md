# Obsidian Agentic Research

**Obsidian Agentic Research** is a mobile-first Obsidian community plugin for running focused, auditable research tasks over a vault. It combines a provider-neutral agent loop with Gemini and Agnes adapters, while exposing vault context through bounded discovery, search, and line-window reads instead of placing whole files into a single model request.

> The first commit is an MVP foundation. It is intentionally smaller than full coding-agent plugins: it focuses on mobile-safe vault access, explicit write approval, and a provider boundary that can grow without coupling the UI to one model vendor.

## What is included

| Capability | Behavior |
| --- | --- |
| Mobile support | `isDesktopOnly` is `false`; runtime code avoids Node.js imports and uses Obsidian APIs |
| Provider choice | Google Gemini or Agnes AI, selectable in settings and from the chat toolbar; review-only AI services are not shipped as plugin providers |
| Bounded context | File metadata, search snippets, and paginated line windows; no default whole-file injection |
| Visible progress | Immediate loading indicator plus compact, expandable step cards with bounded previews |
| Markdown answers | Assistant responses use Obsidian’s Markdown renderer; tool payloads stay escaped/preformatted |
| Saved chats | Save, search, reopen, continue, and delete conversations from the chat toolbar; saved Markdown lives in the vault |
| Explicit attachments | Select up to eight Markdown paths beside the super-MOC; only bounded windows are read at run time |
| Transparent prompts | Read-only built-in Aj-Niplex/Niplex policy plus an additive user prompt; historical system messages are removed before each run; custom prompt capped at 6,000 characters (about 1,500 tokens) |
| Approval policy | Always ask by default, or an explicitly configured 5–60 minute path/tool-scoped window; mismatches still open confirmation |
| AI-discovered MOCs | Processes eligible notes sequentially with bounded per-note context, lets each note belong to multiple model-selected categories, writes category descriptions, and creates a `MOCs super.md` recommendation map |
| Agent tools | `list_files`, `search_vault`, `read_file_chunk`, `create_note`, and `append_note` |
| Safety | Read-only tools run directly; write tools require approval in a modal or a narrowly scoped user-configured window |
| Locality | Vault operations run locally; API calls go directly from Obsidian to the selected provider; user AI data is visible under `NIPLEX-OBSIDIAN/` |
| Skills | Optional separate `Niplex Obsidian Helper` plugin looks up five-character codes from the public-for-preview Niplex catalogue and installs only after preview/approval; the vendored Hermes source tree is local reference material, not a live dependency |
| Extensibility | Provider-neutral runtime and a documented path for a future streamable-HTTP MCP client |

## Installation for development

Clone the private repository into the target vault’s plugin directory, install dependencies, and build the production bundle.

```bash
cd /path/to/vault/.obsidian/plugins
gh repo clone Aj-Niplex/obsidian-agentic-research
cd obsidian-agentic-research
npm install
npm run build
```

Enable **Obsidian Agentic Research** under **Settings → Community plugins**. The manifest requires Obsidian 1.11.4 or newer because the plugin uses SecretStorage for API keys. For watch mode during development, run `npm run dev`, then reload the plugin from Obsidian.

The production bundle consists of `main.js`, `manifest.json`, and `styles.css`. They can also be copied manually into `.obsidian/plugins/obsidian-agentic-research/`. GitHub is only the optional private source backup; the plugin does not need GitHub at runtime or for release validation. The repository includes portable local commands that work in the Manus sandbox, a Horizon-style Node runner, or another local Node environment.

## Provider configuration

Open **Settings → Community plugins → Obsidian Agentic Research**. Choose **Google Gemini** or **Agnes AI**, paste the corresponding API key, and set the model name. The key is stored using Obsidian SecretStorage and is not written into `data.json` or the repository.

The current defaults are `gemini-3.6-flash` for Gemini and `agnes-2.0-flash` for Agnes. Model availability can vary by account and region, so the model fields are editable. The chat toolbar can refresh the selected provider’s live catalogue. Gemini’s chat picker restricts candidates to current Gemini 3 text models plus text-capable Gemma as a last-resort option, so Antigravity product entries, image, live, TTS, and other specialized IDs do not become automatic chat fallbacks. Account-specific unavailable models are removed from later attempts through persisted health quarantine. A rate-limited model is placed on a one-minute cooldown and is not retried during that window; obsolete or unavailable models are quarantined longer. A user-ordered fallback list can be configured, but the plugin never silently changes providers. The plugin uses Obsidian’s `requestUrl` API for both providers, which avoids browser CORS restrictions and avoids desktop-only Node.js networking assumptions.

## AI-discovered MOCs

The MOC organizer does not dump every note into one request and does not assign every note to one fixed folder. A create run classifies eligible notes sequentially, using frontmatter plus a bounded excerpt for one note at a time. There is no arbitrary 20-note ceiling; the user can optionally provide a smaller maintenance limit, while the normal create action processes all eligible notes. The model returns zero to four categories per note, so the same note can appear in multiple category MOCs.

The generated structure defaults to `NIPLEX-OBSIDIAN/MOCs/` → model-selected category notes such as `Love.md` or `Goals.md` → `MOCs super.md`. Every category note includes a short description of what belongs inside it, the assignment signals, and wiki-links. The super-MOC contains category descriptions and model-recommended category combinations for questions that cross areas. The adjust flow processes only the most recently edited eligible note and preserves existing category links locally.

## Bounded vault access

The agent receives a bounded snapshot of `MOCs super.md` at the beginning of every run when available, then chooses relevant category MOCs and note links. If the map is insufficient, it can use a focused `search_vault` query. `list_files` requires a narrow path filter. `read_file_chunk` accepts a path, a starting line, and a maximum line count. Its response includes `totalLines`, `hasMore`, and `nextStartLine`, allowing the agent to page through a long note only when required. Tool results are capped again before they are added to the next model request.

This means the agent can access all relevant files through repeated, targeted operations without requiring the user to paste entire notes or placing complete notes into one outbound request by default. The runtime executes at most one tool call per step and trims older tool turns before another provider request. Write operations are separate tools and are always shown in a confirmation modal.

Vault paths are normalized and must remain relative to the vault. Empty, absolute, drive-letter, duplicate-slash, dot-segment, and `..` traversal paths are rejected. Reads and writes are denied for Obsidian’s config directory and the configured plugin state folder.

The default runtime bounds are eight agent steps, 160 lines per `read_file_chunk` call, 12,000 characters per tool result, 40 search hits, and 250 results for a targeted file listing. These are safety bounds, not a related-note quota: the model decides which relevant files to request one at a time until the step budget is reached. These limits are enforced by the plugin even if a provider requests larger values. Agent requests have a timeout guard, and the mobile UI offers a user-triggered continuation when the step guard is reached.

MOC discovery has a separate default 120-second foreground budget and pauses only at a safe note boundary. A checkpoint stores processed paths and bounded category metadata locally; **Continue from checkpoint** resumes without reclassifying completed notes. This is a responsiveness guard, not a fixed note-count limit. The budget can be adjusted from settings between 30 and 900 seconds.

## User-owned vault workspace

The plugin creates a visible `NIPLEX-OBSIDIAN/` workspace. `Chats/` stores saved conversations as readable Markdown, `Prompts/` mirrors the additive user prompt, `MOCs/` stores generated maps, `Memory/` is reserved for user-controlled memory, `Skills/` stores helper-installed instruction packages, and `Runtime/` is reserved for protected checkpoints and diagnostics. API keys never enter this workspace; Gemini and Agnes keys remain in Obsidian SecretStorage.

For a cleaner visual graph, manually add `NIPLEX-OBSIDIAN/` to **Graph View → Filters → Excluded folders**. The plugin explains this during onboarding but does not silently change Obsidian’s global graph settings. The agent can navigate generated MOCs, while its bounded vault tools cannot read `Chats/`, `Prompts/`, `Memory/`, `Skills/`, or `Runtime/` by default.

## Skill marketplace and helper plugin

The optional private helper repository is [Aj-Niplex/niplex-obsidian-helper](https://github.com/Aj-Niplex/niplex-obsidian-helper). Its Marketplace section accepts a unique five-character code such as `RSH01`, fetches the public-for-preview [Niplex-Obsidian-skills](https://github.com/Aj-Niplex/Niplex-Obsidian-skills) catalogue, verifies a digest, previews the instruction-only manifest, and requires explicit installation approval. Public catalogue lookup works without a PAT; a PAT is only needed if the user later points the helper at a private fork or private endpoint. The helper never reuses provider keys. After relaunch, the main plugin reads validated packages from `NIPLEX-OBSIDIAN/Skills/` and applies only allowlisted bounded settings patches plus additive untrusted guidance. Skills cannot run scripts, replace the protected prompt, acquire keys, or bypass write approval. The full protocol is in `docs/skill-marketplace-design.md`.

## Project structure

```text
src/
├── main.ts                    # Plugin lifecycle, commands, settings, and runtime wiring
├── settings.ts               # Provider, key, model, and bounds settings
├── core/
│   ├── agent-runtime.ts      # Provider-neutral tool loop and approval boundary
│   ├── types.ts              # Shared contracts
│   ├── vault-context.ts      # Bounded vault tools and protected workspace boundaries
│   ├── local-vault-store.ts  # User-owned chats, prompts, workspace, and installed skills
│   ├── approval-policy.ts    # Timed tool/path approval checks
│   └── moc-organizer.ts      # Incremental AI category discovery and super-MOC generation
├── providers/
│   ├── gemini.ts             # Gemini REST adapter
│   └── agnes.ts              # Agnes OpenAI-compatible adapter
└── ui/
    ├── agent-view.ts         # Responsive sidebar chat, saved chats, steps, and Markdown
    ├── approval-modal.ts     # Explicit write approval
    ├── approval-policy-modal.ts # Configure always-ask or scoped windows
    ├── file-picker-modal.ts  # Explicit bounded file selection
    └── moc-modal.ts          # Create or adjust a user-selected MOC
```

## Development checks

```bash
npm run validate
npm run package:release -- /path/to/obsidian-agentic-research.zip
```

`npm run validate` runs tests, the production build, lint, dependency audit, artifact checks, and the mobile-bundle dependency scan. `npm run package:release` creates a ZIP containing only `main.js`, `manifest.json`, and `styles.css`. These commands do not require GitHub Actions, a paid GitHub runner, or a persistent server. The separate helper plugin uses its own `npm run validate` and `npm run package:release` commands with the same local-only principle.

The current repository does not require a desktop-only harness. Android and iOS validation should be done by building the bundle, copying it into a test vault, enabling the plugin, completing or skipping the first-time walkthrough, entering a provider key, refreshing the live model catalogue, exercising a research run, and running the MOC organizer. Verify that category notes contain descriptions, that a note may appear in multiple categories, that `MOCs super.md` links to useful starting sets, that an obsolete selected model is replaced by a current chat model, that **Pause after current note** creates a checkpoint, and that **Continue from checkpoint** avoids reprocessing completed notes.

## Privacy and safety

The plugin sends the user prompt, a bounded super-MOC snapshot when available, explicitly selected attachment snapshots, bounded tool results, and selected tool-call messages to the configured provider. A shared runtime budget caps injected context at 20,000 characters, provider message history at 32,000 characters, and installed skill guidance at 6,000 characters; the custom system prompt is capped at 6,000 characters. It does not upload the vault for indexing or send all note bodies in one request. Saved chats contain the bounded conversation history intentionally retained by the user and never contain API keys. The MOC feature uses note metadata, bounded excerpts, and wiki-links; it does not copy every note body. Redacted local diagnostics can be shared from settings or the command palette; they contain provider/model events and short error summaries, not keys, prompts, responses, or note excerpts. The plugin does not implement background scheduling or automatic vault hooks yet. API keys must never be committed to the repository, screenshots, issue descriptions, or chat transcripts. Additional AI services may be used separately during development for code, research, and UI critique, but they are not embedded in the shipped plugin or given vault access by default.

## References

[1]: https://github.com/allenhutchison/obsidian-gemini "Gemini Scribe for Obsidian"
[2]: https://github.com/YishenTu/claudian "Claudian Obsidian plugin"
[3]: https://github.com/obsidianmd/obsidian-sample-plugin "Official Obsidian sample plugin"
[4]: https://ai.google.dev/gemini-api/docs "Gemini API documentation"
[5]: https://agnes-ai.com/en/docs/overview "Agnes AI API overview"
[6]: https://github.com/brianpetro/obsidian-smart-connections "Smart Connections for Obsidian; pause/resume interaction pattern reference"
