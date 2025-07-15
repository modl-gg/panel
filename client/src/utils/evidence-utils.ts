/**
 * Utility functions for properly handling and displaying evidence objects
 */

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

/**
 * Safely extract display text from an evidence item (string or object)
 * Prevents "[object Object]" display issues
 */
export function getEvidenceDisplayText(evidenceItem: any): string {
  if (typeof evidenceItem === 'string') {
    return evidenceItem;
  }
  
  if (evidenceItem && typeof evidenceItem === 'object') {
    // For file type evidence, prefer fileName
    if (evidenceItem.type === 'file' && evidenceItem.fileName) {
      return evidenceItem.fileName;
    }
    
    // For URL type evidence, use text field
    if (evidenceItem.type === 'url' && evidenceItem.text) {
      return evidenceItem.text;
    }
    
    // Default to text field
    if (evidenceItem.text) {
      return evidenceItem.text;
    }
    
    // Fallback to fileName if no text
    if (evidenceItem.fileName) {
      return evidenceItem.fileName;
    }
  }
  
  // Final fallback
  return 'Evidence';
}

/**
 * Get the clickable URL for an evidence item
 */
export function getEvidenceClickUrl(evidenceItem: any): string {
  if (typeof evidenceItem === 'string') {
    return evidenceItem.startsWith('http') ? evidenceItem : `/uploads/evidence/${evidenceItem}`;
  }
  
  if (evidenceItem && typeof evidenceItem === 'object') {
    // File type evidence - use fileUrl or construct path
    if (evidenceItem.type === 'file') {
      return evidenceItem.fileUrl || `/uploads/evidence/${evidenceItem.fileName || evidenceItem.text}`;
    }
    
    // URL type evidence - use text directly
    if (evidenceItem.type === 'url' && evidenceItem.text) {
      return evidenceItem.text;
    }
    
    // Text type evidence - check if it's a URL
    if (evidenceItem.text) {
      return evidenceItem.text.startsWith('http') ? evidenceItem.text : `/uploads/evidence/${evidenceItem.text}`;
    }
  }
  
  return '';
}

/**
 * Check if an evidence item is clickable (has a valid URL)
 */
export function isEvidenceClickable(evidenceItem: any): boolean {
  const url = getEvidenceClickUrl(evidenceItem);
  return url && (url.startsWith('http') || url.startsWith('/'));
}

/**
 * Get a shortened display name for evidence (for badges/small displays)
 */
export function getEvidenceShortName(evidenceItem: any, maxLength: number = 15): string {
  const displayText = getEvidenceDisplayText(evidenceItem);
  
  // Extract filename if it's a path
  const fileName = displayText.includes('/') ? displayText.split('/').pop() : displayText;
  
  if (!fileName || fileName.length <= maxLength) {
    return fileName || displayText;
  }
  
  return fileName.substring(0, maxLength) + '...';
}

