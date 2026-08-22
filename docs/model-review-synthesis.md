# Independent model review synthesis

## Review scope

Three credential-free repository packets were reviewed independently: the runtime and entry point, the provider adapters and mobile UI, and the project configuration and documentation. Each packet contained source code or project files only. No API keys, vault content, or personal files were sent.

## Reviewer coverage

| Reviewer | Provider | Packets attempted | Result |
| --- | --- | --- | --- |
| Gemini direct | Google Gemini API | Runtime, provider/UI, project | Project review succeeded; two long reviews timed out |
| Agnes direct | Agnes AI API | Runtime, provider/UI, project | Runtime and provider/UI reviews succeeded; project review timed out |
| GPT-5 | Built-in model proxy | Runtime, provider/UI, project | Three substantive reviews succeeded |
| Claude Sonnet 4.6 | Built-in model proxy | Runtime, provider/UI, project | Runtime completed with an empty response; the other two outputs were empty |

The synthesis gives greatest weight to findings independently raised by at least two substantive reviewers, then to issues confirmed directly against the source code or live provider behavior.

## Consensus findings

| Priority | Finding | Independent evidence | Decision |
| --- | --- | --- | --- |
| P0 | Read access did not apply the protected-folder check, and path inputs accepted traversal-like segments | GPT-5 runtime; Agnes runtime raised the related boundary concern | Implemented path sanitization and protected checks for read and write tools |
| P0 | A provider could return multiple tool calls, causing aggregate context growth in one step | GPT-5 runtime; Agnes runtime raised unbounded context growth | Implemented one tool call per step plus bounded history trimming |
| P1 | Provider failures and empty responses were not surfaced consistently | Agnes runtime; Agnes provider/UI; GPT-5 runtime/provider/UI | Implemented graceful runtime error events and empty-response guards |
| P1 | Gemini thought signatures must be preserved across stateless multi-turn tool calls | GPT-5 provider/UI questioned the field, but official Gemini guidance and direct response inspection confirm it is required for reasoning continuity | Parse and resend the signature exactly with the corresponding function-call part |
| P1 | Mobile transcript and approval UI needed stronger small-screen behavior | Agnes provider/UI; GPT-5 provider/UI | Implemented auto-scroll and bounded, scrollable approval arguments |
| P1 | Agnes messages should never contain undefined content | GPT-5 provider/UI; direct schema review | Implemented empty-string/null normalization |
| P2 | CI and release configuration needed reproducibility and safer optional-asset handling | Gemini project; GPT-5 project | Pinned Obsidian types, modernized module resolution, updated verified action majors, and split optional style handling |

## Implemented in the review patch

The vault layer now rejects empty, absolute, drive-letter, backslash-normalized, duplicate-slash, dot-segment, and parent-segment paths before touching the vault. `read_file_chunk` now protects the configured Obsidian config directory and plugin state folder just as writes do.

The runtime now executes at most one tool call per step, sends explanatory tool results for skipped calls, trims older assistant/tool turns before the next provider request, catches provider and tool failures, and keeps the iteration cap. This makes the “bounded context” claim more enforceable on mobile.

The provider/UI patch preserves Gemini thought signatures for stateless reasoning continuity, handles empty Gemini candidates and empty Agnes choices, normalizes Agnes content fields, auto-scrolls every transcript append, and caps the approval modal’s JSON preview with a scrollable mobile layout. Mobile view activation uses the official `Platform.isMobile` flag and a tab leaf fallback.

The project patch pins `obsidian` to 1.12.3, changes TypeScript module resolution to `bundler`, updates CI to verified current major action versions, adds a bundle scan for forbidden Node/Electron imports, and makes the release workflow handle `styles.css` with explicit conditional steps.

## Deferred roadmap

Cancellation with `AbortController`, streaming responses, persisted chat sessions, semantic search, binary/PDF context extraction, declarative settings definitions, a pure unit-test harness for path and context utilities, background scheduling, and a streamable-HTTP MCP client remain intentionally deferred. They should be added one at a time after Android and iOS smoke tests confirm that the bounded text workflow is stable.

## Sources

[1]: https://github.com/allenhutchison/obsidian-gemini "Gemini Scribe for Obsidian"
[2]: https://github.com/YishenTu/claudian "Claudian"
[3]: https://github.com/obsidianmd/obsidian-sample-plugin "Official Obsidian sample plugin"
[4]: https://ai.google.dev/gemini-api/docs "Gemini API documentation"
[5]: https://agnes-ai.com/en/docs/overview "Agnes AI API overview"
[6]: https://obsidian.md/download "Official Obsidian downloads"
