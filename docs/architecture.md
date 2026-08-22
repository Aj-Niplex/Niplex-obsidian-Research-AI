# Obsidian Agentic Research — MVP architecture

## Product direction

This project is a mobile-first Obsidian community plugin for running bounded, auditable agentic research tasks over a vault. The first release will provide a sidebar chat, Gemini and Agnes provider adapters, a small tool loop, and vault tools that return metadata, search hits, or bounded line ranges instead of embedding entire files in model requests.

The plugin runs locally inside Obsidian. API credentials are entered by the user and stored with Obsidian SecretStorage when available; non-secret preferences live in plugin data. The enabled Gemini and Agnes connectors in the Manus session are used for project research and validation, while the shipped plugin remains independently usable on a phone or tablet.

## Mobile constraints

The plugin must set `isDesktopOnly` to `false`, avoid Node.js imports and filesystem APIs, use Obsidian’s `requestUrl` for remote HTTP requests, and use `app.vault` for vault operations. The UI should use Obsidian’s responsive CSS primitives and avoid assumptions about hover, keyboard shortcuts, or a large viewport.

## Runtime layers

| Layer | Responsibility | MVP status |
| --- | --- | --- |
| `src/main.ts` | Plugin lifecycle, settings, commands, and view registration | Implement |
| `src/core/types.ts` | Provider, message, tool, and vault contracts | Implement |
| `src/providers/gemini.ts` | Gemini `generateContent` adapter with function calling | Implement |
| `src/providers/agnes.ts` | Agnes OpenAI-compatible chat-completions adapter | Implement |
| `src/core/vault-context.ts` | File listing, bounded reads, search, and safe writes | Implement |
| `src/core/agent-runtime.ts` | Model/tool loop, iteration cap, and approval boundary | Implement |
| `src/ui/agent-view.ts` | Mobile-responsive chat view and progress rendering | Implement |
| `src/ui/approval-modal.ts` | Confirmation for writes and other side effects | Implement |
| `src/settings.ts` | Provider/model/API-key settings | Implement |
| `src/core/mcp-client.ts` | Future generic streamable-HTTP MCP adapter | Planned, documented only |

## Bounded context contract

The model never receives a whole vault file by default. The available read workflow is:

1. `list_files` returns paths and lightweight metadata only.
2. `search_vault` returns matching file paths plus short, capped snippets.
3. `read_file_chunk` returns a caller-selected line window with `maxChars`, `totalLines`, `hasMore`, and `nextStartLine`.
4. The agent can request additional windows only when needed, and the runtime caps each tool result before it is added to the conversation.

This gives the agent access to all required files through pagination and search while keeping each outbound model turn bounded. Write tools are separate, explicit, and always pass through a user confirmation modal.

## Tool surface

| Tool | Side effect | Purpose |
| --- | --- | --- |
| `list_files` | No | Discover Markdown files without content transfer |
| `search_vault` | No | Find relevant files and bounded matching snippets |
| `read_file_chunk` | No | Read a bounded line range from one Markdown file |
| `create_note` | Yes | Create a new Markdown report after approval |
| `append_note` | Yes | Append a bounded research result or log entry after approval |

System paths such as `.obsidian/` and the plugin’s own state folder are protected from writes.

## Agent loop

A turn begins with a stable system instruction, the user prompt, and conversation history. The selected provider may return text, tool calls, or both. Read-only tools execute immediately; write tools require approval. Tool results are truncated to a safe maximum before being added to the next model request. The loop stops on a final text response, a denied action, a provider error, or the maximum number of iterations.

## Provider contract

The provider interface is provider-neutral. Gemini maps the normalized message and tool contract to the Gemini REST `generateContent` schema. Agnes maps it to OpenAI-compatible `/chat/completions`. Both adapters are called through Obsidian’s HTTP request facility and expose a normalized response, so the runtime and UI are provider-independent.

## Deliberate non-goals for the first commit

The MVP does not implement a full remote MCP client, background scheduling, semantic embeddings, binary/PDF extraction, or automatic lifecycle hooks. Those can be added after the bounded text workflow is stable and tested on both Android and iOS.
