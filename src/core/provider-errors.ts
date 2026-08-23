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

function errorStatus(error: unknown): unknown {
	return typeof error === "object" && error !== null && "status" in error ? (error as { status?: unknown }).status : undefined;
}

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : typeof error === "string" ? error : "";
}

export function isRateLimitError(error: unknown): boolean {
	if (error instanceof ProviderRequestError && error.status === 429) return true;
	if (errorStatus(error) === 429) return true;
	return /(?:http\s*429|status\s*[:=]?\s*429|rate[ -]?limit|quota|resource[_ -]?exhausted|too many requests|exceeded.*limit)/i.test(errorText(error));
}

export function isTransientProviderError(error: unknown): boolean {
	const status = error instanceof ProviderRequestError ? error.status : errorStatus(error);
	return (typeof status === "number" && status >= 500 && status <= 599) || /(?:high demand|temporarily|try again later|service unavailable|overloaded|capacity)/i.test(errorText(error));
}

export function isModelUnavailableError(error: unknown): boolean {
	const status = error instanceof ProviderRequestError ? error.status : errorStatus(error);
	const code = error instanceof ProviderRequestError ? error.code : errorCode(error);
	const codeText = typeof code === "string" ? code : "";
	return status === 404 || /(?:model|resource).*(?:not found|unavailable|no longer available|does not exist)|invalid[_ -]?model/i.test(`${codeText} ${errorText(error)}`);
}

export function providerErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unexpected provider error.";
}
