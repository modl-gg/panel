/**
 * Shared file utility functions
 */

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const validateFileSize = (fileSize: number, maxSize: number): string | null => {
  if (fileSize > maxSize) {
    return `File size exceeds limit of ${formatFileSize(maxSize)}`;
  }
  return null;
};

export const validateFileType = (fileName: string, allowedTypes: string[]): boolean => {
  const fileExtension = fileName.toLowerCase().split('.').pop();
  return allowedTypes.includes(fileExtension || '');
};

export const getFileExtension = (fileName: string): string => {
  return fileName.toLowerCase().split('.').pop() || '';
};

export const isImageFile = (fileName: string): boolean => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  return imageExtensions.includes(getFileExtension(fileName));
};

export const isVideoFile = (fileName: string): boolean => {
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
  return videoExtensions.includes(getFileExtension(fileName));
};