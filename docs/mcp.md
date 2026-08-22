# MCP integration plan

Aj-Niplex MCP was used to inspect the reference repositories and official Gemini and Agnes documentation, then to create the private `Aj-Niplex/obsidian-agentic-research` repository. The project’s provider adapters remain direct mobile-safe HTTP adapters because an Obsidian plugin cannot automatically inherit the Manus session’s MCP credentials or server configuration.

The next extension point is a user-configured streamable-HTTP MCP client. It should use Obsidian `requestUrl`, keep the server URL and authorization data in settings/SecretStorage, call `initialize` and `tools/list` during an explicit connection action, and expose only approved `tools/call` operations to the agent runtime. Stdio MCP is intentionally excluded from this mobile-first project because the plugin must not depend on a local process runtime.

Any future MCP server configuration must show the server origin, authentication behavior, available tools, and data destinations before the user enables it. Tool permissions should reuse the same read-only versus write approval boundary already used by the local vault tools.
