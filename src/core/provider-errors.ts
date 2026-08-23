export class ProviderRequestError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly code?: string,
	) {
		super(message);
		this.name = "ProviderRequestError";
	}
}

export function isRateLimitError(error: unknown): boolean {
	if (error instanceof ProviderRequestError && error.status === 429) return true;
	const status = typeof error === "object" && error !== null && "status" in error ? (error as { status?: unknown }).status : undefined;
	if (status === 429) return true;
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
	return /(?:http\s*429|status\s*[:=]?\s*429|rate[ -]?limit|quota|resource[_ -]?exhausted|too many requests|exceeded.*limit)/i.test(message);
}

export function providerErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unexpected provider error.";
}
