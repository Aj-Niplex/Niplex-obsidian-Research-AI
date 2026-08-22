export function sanitizeVaultPath(raw: string): string | null {
	const value = raw.trim();
	if (!value || value.includes("\0")) return null;
	if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return null;
	const normalized = value.replace(/\\/g, "/");
	if (normalized.includes("//")) return null;
	const parts = normalized.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
	return parts.join("/");
}
