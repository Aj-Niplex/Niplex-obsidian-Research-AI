# Contributor guidance

## Project scope

Obsidian Agentic Research is a mobile-first TypeScript community plugin. The entry point is `src/main.ts`, and the production bundle is `main.js`. Release artifacts are `main.js`, `manifest.json`, and `styles.css`.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

Use npm and esbuild as configured in `package.json`. Keep runtime dependencies browser-compatible and bundle all runtime code into `main.js`.

## Architecture rules

Keep `main.ts` focused on plugin lifecycle, settings, commands, and dependency wiring. Put provider-specific behavior under `src/providers`, provider-neutral contracts and the agent loop under `src/core`, and UI under `src/ui`.

The mobile contract is strict: do not import Node.js or Electron APIs in runtime code, do not access files outside the vault, set `isDesktopOnly` to `false`, use `app.vault` for vault access, and use Obsidian `requestUrl` for remote HTTP calls.

The bounded-context contract is also strict. Never put a full vault file into a model request by default. Use metadata-only listing, capped search snippets, and explicit line-window reads. Cap tool results before they are appended to conversation history. Write operations must remain separate from read-only tools and require user confirmation.

## Security and privacy

Never commit API keys, access tokens, vault content, `data.json`, or local environment files. Store provider keys through Obsidian SecretStorage. Do not add telemetry, hidden background network activity, remote code execution, or automatic plugin updates. Document every external service and the data sent to it.

## Release rules

Keep `manifest.json` and `versions.json` synchronized. Do not change the plugin ID after release. Use semantic versions without a leading `v` in release tags. Test the built bundle in a real Android and iOS vault before calling a release mobile-compatible.

## Validation

Before opening a pull request, run `npm run build`, `npm run lint`, and a manual smoke test that covers provider configuration, `list_files`, `search_vault`, `read_file_chunk`, and an approved `create_note` or `append_note` action. Review generated diffs for accidental context or credential leakage.

## References

- Official sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- Developer docs: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
