export class ApiHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string) {
    super(`${status}: ${bodyText || statusText}`);
    this.name = 'ApiHttpError';
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

function statusOf(error: unknown): number | null {
  return error instanceof ApiHttpError ? error.status : null;
}

export function isRetryableHttpError(error: unknown): boolean {
  const status = statusOf(error);
  return status === null || status >= 500;
}
