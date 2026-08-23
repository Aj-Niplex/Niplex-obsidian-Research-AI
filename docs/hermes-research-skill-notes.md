# Hermes research skill notes

Source inspected: https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/research

The upstream optional research collection contains multiple subdirectories, including bioinformatics, darwinian-evolver, domain-intel, drug-discovery, duckduckgo-search, gitnexus-explorer, osint-investigation, parallel-cli, pinecone-research, qmd, scrapling, and searxng-search. It is a public repository and the upstream page reports a broad optional-skills catalog.

Source inspected: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills

Hermes describes skills as on-demand knowledge documents using progressive disclosure: a lightweight list/description first, full skill content only when needed, and specific reference files as a deeper level. Skills use SKILL.md and are compatible with the agentskills.io open standard. This is useful inspiration for Niplex, but the Obsidian helper remains stricter: packages are instruction-only, require preview and explicit approval, cannot execute code or remote tools, cannot access provider keys, cannot bypass approvals, and are activated by the main plugin after relaunch.

Adaptation decision: do not blindly copy upstream package trees or executable/vendor skills. Convert research workflows into short, credited SKILL.md instruction packages with five-character catalogue codes and only allowlisted bounded settings patches. The public catalogue should clearly distinguish Niplex-authored adaptations from upstream references.
