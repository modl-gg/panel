import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely open an external URL in a new tab. Accepts only http(s) absolute URLs or
 * same-origin root-relative paths ('/...'); rejects javascript:/data:/blob: and
 * protocol-relative '//host'. Opens with 'noopener,noreferrer' and defensively nulls
 * opener to prevent reverse-tabnabbing and Referer leakage. Returns false if blocked.
 */
export function openExternalUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  // Root-relative same-origin path, but reject protocol-relative '//host'.
  const isRelative = trimmed.startsWith('/') && !trimmed.startsWith('//');
  let isHttp = false;
  if (!isRelative) {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  if (!isRelative && !isHttp) return false;
  const win = window.open(trimmed, '_blank', 'noopener,noreferrer');
  if (win) win.opener = null;
  return true;
}
