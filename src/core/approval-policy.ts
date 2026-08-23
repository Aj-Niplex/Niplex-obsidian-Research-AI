import { sanitizeVaultPath } from "./path-utils";
import type { ToolCall, ToolDefinition, WriteApprovalPolicy } from "./types";

export const APPROVAL_TOOL_NAMES = ["create_file", "append_file"] as const;

export function normalizeApprovalPrefix(value: unknown): string {
	if (typeof value !== "string") return "";
	try {
		return sanitizeVaultPath(value) ?? "";
	} catch {
		return "";
	}
}

export function normalizeApprovalPolicy(value: unknown, now = Date.now()): WriteApprovalPolicy {
	if (!value || typeof value !== "object") return { mode: "always", expiresAt: 0, pathPrefix: "", tools: [] };
	const source = value as Record<string, unknown>;
	const mode = source.mode === "timed" ? "timed" : "always";
	const expiresAt = typeof source.expiresAt === "number" && Number.isFinite(source.expiresAt) ? source.expiresAt : 0;
	const minExpiry = now + 5 * 60 * 1000;
	const maxExpiry = now + 60 * 60 * 1000;
	const boundedExpiry = expiresAt >= minExpiry && expiresAt <= maxExpiry ? expiresAt : 0;
	const tools = Array.isArray(source.tools) ? [...new Set(source.tools.filter((tool): tool is string => typeof tool === "string" && APPROVAL_TOOL_NAMES.includes(tool as (typeof APPROVAL_TOOL_NAMES)[number])))] : [];
	const pathPrefix = normalizeApprovalPrefix(source.pathPrefix);
	if (mode !== "timed" || !boundedExpiry || !pathPrefix || !tools.length) return { mode: "always", expiresAt: 0, pathPrefix: "", tools: [] };
	return { mode: "timed", expiresAt: boundedExpiry, pathPrefix, tools };
}

function targetPath(call: ToolCall): string {
	const raw = call.arguments.path;
	return typeof raw === "string" ? normalizeApprovalPrefix(raw) : "";
}

export function canAutoApproveWrite(policy: WriteApprovalPolicy, tool: ToolDefinition, call: ToolCall, now = Date.now()): boolean {
	if (policy.mode !== "timed" || policy.expiresAt <= now || !policy.pathPrefix || !policy.tools.includes(tool.name)) return false;
	const path = targetPath(call);
	return Boolean(path && (path === policy.pathPrefix || path.startsWith(`${policy.pathPrefix}/`)));
}
