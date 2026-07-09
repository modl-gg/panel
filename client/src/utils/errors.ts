export function errorMessageOr(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
