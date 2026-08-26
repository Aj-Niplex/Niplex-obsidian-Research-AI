export function normalizeVersion(value: string): string {
	return value.trim().replace(/^v/i, "");
}

export function compareVersions(left: string, right: string): number {
	const parse = (value: string) => normalizeVersion(value).split(".").map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10) || 0);
	const leftParts = parse(left);
	const rightParts = parse(right);
	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		const leftPart = leftParts[index] ?? 0;
		const rightPart = rightParts[index] ?? 0;
		if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
	}
	return 0;
}

export function isReleaseNewer(latest: string | undefined, installed: string | undefined): boolean {
	return Boolean(latest && installed && compareVersions(latest, installed) > 0);
}
