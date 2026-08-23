# Mobile interaction upgrade design

## User-visible agent progress

Each run begins with an immediate animated `Working` indicator. The runtime emits step summaries, tool names, bounded result previews, and completion/error states. The interface groups each operation into a compact disclosure card. Cards are collapsed by default once a step finishes, while the current step can remain open. The cards expose operational summaries and bounded evidence, not hidden chain-of-thought.

## Markdown rendering

User messages remain plain text. Assistant answers are rendered with Obsidian’s Markdown renderer so headings, emphasis, links, lists, blockquotes, and fenced code are displayed as Markdown. Tool payloads remain escaped/preformatted text inside disclosure cards so JSON cannot become executable HTML.

## Chat persistence

A saved chat contains a generated identifier, title, timestamps, selected provider/model, and normalized conversation messages. API keys are never included. The plugin stores chats with ordinary plugin data, so users can save, reopen, and delete conversations. Stored chats may contain the bounded note excerpts that were intentionally sent to the provider; the UI and README will state this clearly.

## In-chat provider and model switching

The composer includes separate provider and model selectors. The model selector is populated from the selected provider’s live catalogue when the API key is available, while the configured model remains available if catalogue refresh is unavailable. Changing the selector updates the active provider/model for the next run and persists the preference. If a model is rate-limited, the runtime tries another available model from the same provider and reports the switch in the compact activity cards. It never silently changes from Gemini to Agnes or vice versa.

## MOC workflow

The MOC button opens two explicit actions:

1. **Discover all eligible categories.** The organizer processes eligible Markdown notes sequentially. Each classification request includes only one note’s frontmatter, metadata, and bounded excerpt; there is no arbitrary 20-note ceiling and no single request contains the vault body.
2. **Adjust with the latest edited note.** The plugin identifies the newest non-protected Markdown note, reclassifies its bounded context, and preserves existing category links where appropriate.

MOC writes are initiated by the user through a dedicated mobile modal. Protected folders and unsafe paths continue to be rejected. Once `MOCs super.md` exists, every research run receives a bounded snapshot first. The agent chooses relevant category MOCs and note links, reads them in bounded chunks one at a time, and can use focused search when the map is insufficient. The step setting is a visible runaway-loop guard rather than an arbitrary related-note cap.

## Scope control

The existing bounded tools remain available, but the UI will make the scope visible. The plugin will not automatically upload a vault index or full file bodies. The MOC is a user-created navigation artifact, not a silent full-vault export. Saved chats can contain the bounded excerpts deliberately returned by tools, so users should delete saved chats when that history is no longer needed. A first-time walkthrough explains these boundaries and can be reopened from settings.
