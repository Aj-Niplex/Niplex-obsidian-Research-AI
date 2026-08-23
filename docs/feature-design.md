# Mobile interaction upgrade design

## User-visible agent progress

Each run begins with an immediate animated `Working` indicator. The runtime emits step summaries, tool names, bounded result previews, and completion/error states. The interface groups each operation into a compact disclosure card. Cards are collapsed by default once a step finishes, while the current step can remain open. The cards expose operational summaries and bounded evidence, not hidden chain-of-thought.

## Markdown rendering

User messages remain plain text. Assistant answers are rendered with Obsidian’s Markdown renderer so headings, emphasis, links, lists, blockquotes, and fenced code are displayed as Markdown. Tool payloads remain escaped/preformatted text inside disclosure cards so JSON cannot become executable HTML.

## Chat persistence

A saved chat contains a generated identifier, title, timestamps, selected provider/model, and normalized conversation messages. API keys are never included. The plugin stores chats with ordinary plugin data, so users can save, reopen, and delete conversations. Stored chats may contain the bounded note excerpts that were intentionally sent to the provider; the UI and README will state this clearly.

## In-chat model switching

The composer includes a provider/model selector populated from the two configured settings: Gemini with its configured model and Agnes with its configured model. Changing the selector updates the active provider for the next run and persists the preference. The full model names remain editable in settings.

## MOC workflow

The MOC button opens two explicit actions:

1. **Create a new MOC.** The plugin creates a Markdown note containing links generated from note metadata only. It does not read every note body.
2. **Adjust a MOC with the latest edited note.** The plugin identifies the newest non-protected Markdown note and adds its wiki-link to a chosen existing MOC without copying the note body. The selected MOC becomes the preferred scope hint for the next agent prompt.

MOC writes are initiated by the user through a dedicated mobile modal. Protected folders and unsafe paths continue to be rejected. The agent is encouraged to start from the selected MOC and only inspect additional notes when the request requires them.

## Scope control

The existing bounded tools remain available, but the UI will make the scope visible. The plugin will not automatically upload a vault index or full file bodies. The MOC is a user-created navigation artifact, not a silent full-vault export.
