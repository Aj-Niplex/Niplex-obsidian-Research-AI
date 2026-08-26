export function normalizeVersion(value: string): string {
	return value.trim().replace(/^v/i, "");
}

type ParsedVersion = {
	core: [number, number, number];
	prerelease: string[] | null;
};

function parseVersion(value: string): ParsedVersion {
	const normalized = normalizeVersion(value);
	const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(normalized);
	if (!match) return { core: [0, 0, 0], prerelease: null };
	return {
		core: [Number.parseInt(match[1] ?? "0", 10), Number.parseInt(match[2] ?? "0", 10), Number.parseInt(match[3] ?? "0", 10)],
		prerelease: match[4] ? match[4].split(".") : null,
	};
}

function comparePrerelease(left: string[] | null, right: string[] | null): number {
	if (!left && !right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const leftPart = left[index];
		const rightPart = right[index];
		if (leftPart === undefined) return -1;
		if (rightPart === undefined) return 1;
		if (leftPart === rightPart) continue;
		const leftNumeric = /^\d+$/.test(leftPart);
		const rightNumeric = /^\d+$/.test(rightPart);
		if (leftNumeric && rightNumeric) return Number.parseInt(leftPart, 10) > Number.parseInt(rightPart, 10) ? 1 : -1;
		if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
		return leftPart > rightPart ? 1 : -1;
	}
	return 0;
}

export function compareVersions(left: string, right: string): number {
	const leftVersion = parseVersion(left);
	const rightVersion = parseVersion(right);
	for (let index = 0; index < leftVersion.core.length; index += 1) {
		const leftPart = leftVersion.core[index] ?? 0;
		const rightPart = rightVersion.core[index] ?? 0;
		if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
	}
	return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

export function isReleaseNewer(latest: string | undefined, installed: string | undefined): boolean {
	return Boolean(latest && installed && compareVersions(latest, installed) > 0);
}
