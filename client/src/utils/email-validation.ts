const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(email: string | undefined | null): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isValidEmail(email: string | undefined | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  return EMAIL_REGEX.test(normalized);
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const errorPayload = payload as {
    message?: string;
    error?: string;
    errors?: string[];
  };

  if (Array.isArray(errorPayload.errors) && errorPayload.errors.length > 0) {
    return errorPayload.errors[0];
  }

  if (typeof errorPayload.message === 'string' && errorPayload.message.trim().length > 0) {
    return errorPayload.message;
  }

  if (typeof errorPayload.error === 'string' && errorPayload.error.trim().length > 0) {
    return errorPayload.error;
  }

  return fallback;
}
