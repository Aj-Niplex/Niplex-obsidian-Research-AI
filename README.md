# Obsidian Agentic Research

**Obsidian Agentic Research** is a mobile-first Obsidian community plugin for running focused, auditable research tasks over a vault. It combines a provider-neutral agent loop with Gemini and Agnes adapters, while exposing vault context through bounded discovery, search, and line-window reads instead of placing whole files into a single model request.

> The first commit is an MVP foundation. It is intentionally smaller than full coding-agent plugins: it focuses on mobile-safe vault access, explicit write approval, and a provider boundary that can grow without coupling the UI to one model vendor.

## What is included

| Capability | Behavior |
| --- | --- |
| Mobile support | `isDesktopOnly` is `false`; runtime code avoids Node.js imports and uses Obsidian APIs |
| Provider choice | Google Gemini or Agnes AI, selected in plugin settings |
| Bounded context | File metadata, search snippets, and paginated line windows; no default whole-file injection |
| Agent tools | `list_files`, `search_vault`, `read_file_chunk`, `create_note`, and `append_note` |
| Safety | Read-only tools run directly; write tools require approval in a modal |
| Locality | Vault operations run locally; API calls go directly from Obsidian to the selected provider |
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

The production bundle consists of `main.js`, `manifest.json`, and `styles.css`. They can also be copied manually into `.obsidian/plugins/obsidian-agentic-research/`.

## Provider configuration

Open **Settings → Community plugins → Obsidian Agentic Research**. Choose **Google Gemini** or **Agnes AI**, paste the corresponding API key, and set the model name. The key is stored using Obsidian SecretStorage and is not written into `data.json` or the repository.

The current defaults are `gemini-3.6-flash` for Gemini and `agnes-2.0-flash` for Agnes. Model availability can vary by account and region, so the model fields are editable. The plugin uses Obsidian’s `requestUrl` API for both providers, which avoids browser CORS restrictions and avoids desktop-only Node.js networking assumptions.

## Bounded vault access

The agent is instructed to begin with `list_files` or `search_vault`. `read_file_chunk` accepts a path, a starting line, and a maximum line count. Its response includes `totalLines`, `hasMore`, and `nextStartLine`, allowing the agent to page through a long note only when required. Tool results are capped again before they are added to the next model request.

This means the agent can access all relevant files through repeated, targeted operations without requiring the user to paste entire notes or placing complete notes into one outbound request by default. The runtime executes at most one tool call per step and trims older tool turns before another provider request. Write operations are separate tools and are always shown in a confirmation modal.

Vault paths are normalized and must remain relative to the vault. Empty, absolute, drive-letter, duplicate-slash, dot-segment, and `..` traversal paths are rejected. Reads and writes are denied for Obsidian’s config directory and the configured plugin state folder.

The default runtime bounds are eight agent steps, 160 lines per `read_file_chunk` call, 12,000 characters per tool result, 40 search hits, and 250 listed files. These limits are enforced by the plugin even if a provider requests larger values.

## Project structure

```text
src/
├── main.ts                    # Plugin lifecycle, commands, settings, and runtime wiring
├── settings.ts               # Provider, key, model, and bounds settings
├── core/
│   ├── agent-runtime.ts      # Provider-neutral tool loop and approval boundary
│   ├── types.ts              # Shared contracts
│   └── vault-context.ts      # Bounded vault tools
├── providers/
│   ├── gemini.ts             # Gemini REST adapter
│   └── agnes.ts              # Agnes OpenAI-compatible adapter
└── ui/
    ├── agent-view.ts         # Responsive sidebar chat
    └── approval-modal.ts     # Explicit write approval
```

## Development checks

```bash
npm run build
npm run lint
```

The current repository does not require a desktop-only harness. Android and iOS validation should be done by building the bundle, copying it into a test vault, enabling the plugin, entering a provider key, and exercising discovery, bounded reads, and an approved note creation.

## Privacy and safety

The plugin sends the user prompt, bounded tool results, and the selected tool-call messages to the configured provider. It does not upload the vault for indexing in this MVP. The plugin does not implement background scheduling or automatic vault hooks yet. API keys must never be committed to the repository, screenshots, issue descriptions, or chat transcripts.

## References

[1]: https://github.com/allenhutchison/obsidian-gemini "Gemini Scribe for Obsidian"
[2]: https://github.com/YishenTu/claudian "Claudian Obsidian plugin"
[3]: https://github.com/obsidianmd/obsidian-sample-plugin "Official Obsidian sample plugin"
[4]: https://ai.google.dev/gemini-api/docs "Gemini API documentation"
[5]: https://agnes-ai.com/en/docs/overview "Agnes AI API overview"
