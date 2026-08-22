# Gemini function-call protocol validation

The Gemini adapter was checked against the official function-calling and thought-signatures documentation. The official guidance states that Gemini thinking models use thought signatures for reasoning continuity and that, in stateless mode, client-managed history must preserve model-generated thought blocks exactly across subsequent turns.

The live Gemini response used for validation returned a `functionCall` part with an `id` and a sibling `thoughtSignature`. The adapter therefore parses the signature into the normalized `ToolCall` and resends it unchanged on the corresponding assistant function-call part. It must not discard or rewrite this metadata when the runtime proceeds to a tool-result turn.

The adapter still uses the `generateContent` REST endpoint, so it does not rely on SDK-managed state. This is why the signature is retained in the normalized message contract.

References:

[1]: https://ai.google.dev/gemini-api/docs/function-calling "Function calling with the Gemini API"
[2]: https://ai.google.dev/gemini-api/docs/thought-signatures "Gemini thinking and thought signatures"
