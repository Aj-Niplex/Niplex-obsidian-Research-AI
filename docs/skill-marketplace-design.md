# Niplex Obsidian skill marketplace protocol

## Purpose

The marketplace distributes **instruction-only Obsidian research skills**. A skill can add a bounded research workflow, response preference, or allowed settings patch. It cannot execute JavaScript, shell commands, network calls, scripts, provider-key operations, arbitrary file writes, or changes to the protected built-in system prompt.

## Catalogue and code

The public-for-preview `Aj-Niplex/Niplex-Obsidian-skills` repository contains a versioned `catalogue.json`. Every catalogue entry has a unique uppercase five-character alphanumeric `code`, such as `RSH01`, together with a name, version, description, relative package path, SHA-256 digest, and supported helper-protocol version. A package contains `skill.json` and `SKILL.md`; it must not contain executable files or hidden dependencies.

The helper plugin does not embed a GitHub token. The public catalogue works without a PAT. The user supplies a read-only fine-grained token only if a later private fork or private endpoint needs authentication, and the token is stored with Obsidian SecretStorage. A user may instead provide a self-hosted or exported catalogue URL. No provider key is reused for marketplace access.

## Lookup and installation flow

The user pastes a five-character code into the helper plugin. The helper fetches the catalogue, validates the code and endpoint, fetches the package, validates its manifest, checks that the package contains only allowed files, and shows a preview containing the name, version, description, requested settings patch, and prompt text. Installation requires an explicit confirmation. A failed digest or schema check blocks installation.

After confirmation, the helper writes the validated package to `NIPLEX-OBSIDIAN/Skills/<code>/skill.json` and `NIPLEX-OBSIDIAN/Skills/<code>/SKILL.md`. The main plugin reads installed skills at startup and on the next relaunch adds their bounded instructions as untrusted, additive runtime guidance. A skill never replaces or edits the protected prompt. Removal is done by deleting the corresponding visible skill folder or using a future helper uninstall action.

## Allowed manifest shape

```json
{
  "code": "RSH01",
  "name": "Research question framing",
  "version": "1.0.0",
  "description": "Turn a broad question into a bounded evidence plan.",
  "protocolVersion": 1,
  "prompt": "Prefer a short evidence plan before reading more files.",
  "settingsPatch": {
    "maxIterations": 10
  }
}
```

Only `maxIterations`, `maxReadLines`, and `maxToolResultChars` may be proposed, and values are clamped by the main plugin’s existing settings normalizer. The helper must reject all other settings keys, executable extensions, URLs inside package instructions that request network behavior, prompt text that asks to reveal secrets or bypass approvals, and package paths outside the named skill directory.

## Privacy boundaries

API keys remain only in Gemini or Agnes SecretStorage entries. Marketplace tokens remain only in the helper’s SecretStorage entry. Chats, the additive prompt, MOCs, memory, installed skill files, and the protected runtime workspace are vault-local under `NIPLEX-OBSIDIAN/`. The main agent can navigate MOCs but cannot read `Chats/`, `Prompts/`, `Memory/`, `Skills/`, or `Runtime/` through its bounded vault tools.

## Helper plugin separation

The helper is deliberately a separate plugin. This keeps marketplace networking and package installation out of the research runtime and lets users inspect, disable, or remove the helper independently. The main plugin remains functional without the helper; users can also install a skill by manually placing a validated package under the visible Skills folder.

## Release safety

Both repositories use local validation and packaging only. No GitHub Actions workflow is required. The skills repository is public for preview while the main and helper plugin repositories remain private by default. If a future public read-only catalogue is desired, the endpoint can change without changing the package schema or installation safeguards.
