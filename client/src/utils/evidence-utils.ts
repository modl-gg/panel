export interface EvidenceItem {
  text: string;
  issuerName: string;
  date: string | Date;
  type: 'text' | 'url' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export type EvidenceLike = string | Partial<EvidenceItem>;

/** Prevents "[object Object]" display issues */
export function getEvidenceDisplayText(evidenceItem: EvidenceLike): string {
  if (typeof evidenceItem === 'string') {
    return evidenceItem;
  }
  
  if (evidenceItem && typeof evidenceItem === 'object') {
    if (evidenceItem.type === 'file' && evidenceItem.fileName) {
      return evidenceItem.fileName;
    }
    
    if (evidenceItem.type === 'url' && evidenceItem.text) {
      return evidenceItem.text;
    }
    
    if (evidenceItem.text) {
      return evidenceItem.text;
    }
    
    if (evidenceItem.fileName) {
      return evidenceItem.fileName;
    }
  }
  
  return 'Evidence';
}

export function getEvidenceClickUrl(evidenceItem: EvidenceLike): string {
  if (typeof evidenceItem === 'string') {
    return evidenceItem.startsWith('http') ? evidenceItem : `/uploads/evidence/${evidenceItem}`;
  }
  
  if (evidenceItem && typeof evidenceItem === 'object') {
    if (evidenceItem.type === 'file') {
      return evidenceItem.fileUrl || `/uploads/evidence/${evidenceItem.fileName || evidenceItem.text}`;
    }
    
    if (evidenceItem.type === 'url' && evidenceItem.text) {
      return evidenceItem.text;
    }
    
    if (evidenceItem.text) {
      return evidenceItem.text.startsWith('http') ? evidenceItem.text : `/uploads/evidence/${evidenceItem.text}`;
    }
  }
  
  return '';
}

export function isEvidenceClickable(evidenceItem: EvidenceLike): boolean {
  const url = getEvidenceClickUrl(evidenceItem);
  // Coerce to a real boolean: a falsy url ('') would otherwise leak through the `&&`
  // as the empty string, contradicting the declared boolean return type.
  return Boolean(url) && (url.startsWith('http') || url.startsWith('/'));
}

export function getEvidenceShortName(evidenceItem: EvidenceLike, maxLength: number = 15): string {
  const displayText = getEvidenceDisplayText(evidenceItem);
  const fileName = displayText.includes('/') ? displayText.split('/').pop() : displayText;
  
  if (!fileName || fileName.length <= maxLength) {
    return fileName || displayText;
  }
  
  return fileName.substring(0, maxLength) + '...';
}

export type EvidenceMediaType = 'image' | 'video' | 'link' | 'text';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];

export function getEvidenceMediaType(value: string): EvidenceMediaType {
  const [path = ''] = value.toLowerCase().split(/[?#]/);

  if (IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext))) return 'image';
  if (VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext))) return 'video';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return 'link';

  return 'text';
}

export function normalizeCdnHost(rawDomain: string | null | undefined): string | null {
  const raw = rawDomain?.trim();
  if (!raw) return null;

  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    const host = (raw.replace(/^https?:\/\//i, '').split('/')[0] ?? '').toLowerCase();
    return host || null;
  }
}

export function isTrustedCdnUrl(url: string | null | undefined, cdnHost: string | null): boolean {
  if (!url || !cdnHost) return false;

  try {
    return new URL(url).hostname.toLowerCase() === cdnHost;
  } catch {
    return false;
  }
}

export function getTrustedEvidenceMediaType(value: string, cdnHost: string | null): EvidenceMediaType {
  const mediaType = getEvidenceMediaType(value);
  if (mediaType !== 'image' && mediaType !== 'video') {
    return mediaType;
  }
  if (isTrustedCdnUrl(value, cdnHost)) {
    return mediaType;
  }
  return /^https?:\/\//i.test(value) || value.startsWith('/') ? 'link' : 'text';
}

