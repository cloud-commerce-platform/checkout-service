export class DomainError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly retryable: boolean
	) {
		super(message);
		this.name = "DomainError";
	}
}
