import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeExternalHref(url: string | undefined | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (/[\t\n\r]/.test(trimmed)) return undefined;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return undefined;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch {
    return undefined;
  }
  return undefined;
}

export function openExternalUrl(url: string | undefined | null): boolean {
  const safe = safeExternalHref(url);
  if (!safe) return false;
  const win = window.open(safe, '_blank', 'noopener,noreferrer');
  if (win) win.opener = null;
  return true;
}
