# Contributing to Niplex Research AI

Thank you for helping improve Niplex Research AI. Contributions should preserve the plugin’s mobile-first behavior, bounded vault context, local user-owned storage, SecretStorage-only provider keys, and approval boundary for vault writes.

## Before opening a pull request

Use Node.js 20 or newer, install dependencies, and run the complete local validation suite:

```bash
npm install
npm test
npm run build
npm run lint
npm run validate
```

Do not commit generated `main.js` or local build directories. Release assets are built locally and attached only to an exact semantic-version tag.

## Code and privacy expectations

Keep provider calls limited to the focused question, bounded context, explicitly selected attachments, and bounded tool results. Do not add whole-vault uploads, background hooks, hidden network calls, or API-key persistence in vault files. Any feature that creates or modifies vault files must remain behind **Create & edit** mode and an explicit approval check.

Use the existing provider adapters, fallback diagnostics, path validation, context budgets, and local-vault store rather than introducing duplicate infrastructure. Keep UI changes usable on narrow mobile screens and avoid desktop-only imports or APIs.

## Pull requests

Describe the user-facing behavior, privacy impact, compatibility impact, and tests you ran. If a change affects the Community Plugins manifest or release assets, explain the version bump and confirm that the release tag exactly matches `manifest.json`.

By contributing, you agree that your contributions are provided under the repository’s MIT License.
