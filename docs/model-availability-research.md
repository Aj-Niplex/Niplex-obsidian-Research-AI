# Model availability research

Date checked: 2026-08-23.

## Official Google Gemini documentation

Source: https://ai.google.dev/gemini-api/docs/models

The official models page lists Gemini 3.7 Flash, Gemini 3.6 Flash, Gemini 3.5 Flash, Gemini 3.5 Flash-Lite, and Gemini 3.1 Flash-Lite as current stable text-capable families. It separately lists image, live, TTS, video, and other specialized models. The plugin should therefore restrict automatic chat fallback to text-generation models and prefer the modern Flash/Lite families.

Source: https://ai.google.dev/gemini-api/docs/deprecations

The official deprecations page distinguishes globally listed models from account-accessible models. It currently lists `gemini-2.5-flash` and `gemini-2.5-pro` with no shutdown date announced, while several dated preview and older 2.0 models have already passed shutdown dates. Therefore a model can be present in the global `/models` response but still return an account-specific unavailable error, as seen in the user’s diagnostics. Runtime fallback must learn and persist per-account model health from actual completion responses instead of trusting catalogue presence alone.

## Implementation implication

Do not hardcode `gemini-2.5-flash` or `gemini-2.5-pro` as universally dead. If an account returns an unavailable/no-longer-available error, quarantine that provider/model for the configured health window and never retry it during that window. Rank modern fast text models ahead of Gemma and Pro models. Treat catalogue discovery as a candidate source, not proof that the account can call a model.

`Antigravity` appears in Google documentation as an agent/development platform surface, not as a Gemini Developer API model ID. It must not be inserted into the chat model fallback list unless an actual provider API endpoint exposes it as a text-generation model.

## Antigravity clarification

Source: https://antigravity.google/

Google describes Antigravity as an agentic development platform with local agents, an IDE, CLI, and SDK. The page is not a model catalogue and does not expose an `antigravity` Gemini Developer API model ID. Antigravity must therefore not be added as a chat-provider model. The page’s current product references include Gemini 3.7 Flash and Gemini 3.6 Flash as models used within the Antigravity product, which is separate from the Developer API model ID list.

## Current recommended fast model

Source: https://ai.google.dev/gemini-api/docs/latest-model

Google currently describes `gemini-3.7-flash` as generally available and ready for production use, and identifies it as a workhorse model for coding and agents. The plugin should rank it ahead of older or slower candidates when it appears in the user’s account-accessible catalogue.
