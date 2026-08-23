# Mobile validation checklist

## Build validation

Run `npm ci`, `npm run build`, and `npm run lint` on the development machine. Confirm that `main.js` is generated at the repository root and that the manifest keeps `isDesktopOnly` set to `false`.

## Android and iOS smoke test

Copy `main.js`, `manifest.json`, and `styles.css` into a test vault at `.obsidian/plugins/niplex-agentic-research/`. Enable the plugin, open the command palette, and select **Open agentic research**. The view should fit a narrow screen, the composer should remain usable without hover, and the run button should be reachable with touch.

In plugin settings, select Gemini, enter a test key, and verify that the key is retained after restarting Obsidian without appearing in `data.json`. Repeat with Agnes. Ask the agent to list files, search for a distinctive phrase, and read a long note starting from a chosen line. Confirm that the transcript shows metadata, snippets, and bounded windows rather than an entire note.

Ask the agent to create a new report note or append to an existing note. Confirm that the approval modal identifies the tool and arguments, that **Deny** leaves the vault unchanged, and that **Approve** performs only the requested write. Verify that `.obsidian/` and the plugin state folder remain protected.

## Regression checks

Test a missing API key, an invalid model name, an empty search query, a missing file, a duplicate note path, a request for a later line window, and a provider error. The plugin should show a readable error and remain responsive. Run the smoke test after every change to provider message mapping or tool schemas.
