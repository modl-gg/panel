export type MaybePublicKeyWrapped<T> = T | { publicKey: T };

export function unwrapPublicKeyOptions<T extends object>(options: MaybePublicKeyWrapped<T>): T {
  return 'publicKey' in options ? options.publicKey : options;
}

export function isWebAuthnCancellation(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotAllowedError';
}
