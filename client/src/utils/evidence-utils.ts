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

/** Prevents "[object Object]" display issues */
export function getEvidenceDisplayText(evidenceItem: any): string {
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

export function getEvidenceClickUrl(evidenceItem: any): string {
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

export function isEvidenceClickable(evidenceItem: any): boolean {
  const url = getEvidenceClickUrl(evidenceItem);
  return url && (url.startsWith('http') || url.startsWith('/'));
}

export function getEvidenceShortName(evidenceItem: any, maxLength: number = 15): string {
  const displayText = getEvidenceDisplayText(evidenceItem);
  const fileName = displayText.includes('/') ? displayText.split('/').pop() : displayText;
  
  if (!fileName || fileName.length <= maxLength) {
    return fileName || displayText;
  }
  
  return fileName.substring(0, maxLength) + '...';
}

