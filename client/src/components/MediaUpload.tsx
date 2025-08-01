import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, Video, File, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Card, CardContent } from '@modl-gg/shared-web/components/ui/card';
import { cn } from '@modl-gg/shared-web/lib/utils';
import { useMediaUpload } from '@/hooks/use-media-upload';
import { formatFileSize } from '@/utils/file-utils';

interface MediaUploadProps {
  uploadType: 'evidence' | 'ticket' | 'appeal' | 'article' | 'server-icon';
  onUploadComplete?: (result: { url: string; key: string }, file?: File) => void;
  onUploadStart?: () => void;
  onUploadError?: (error: string) => void;
  maxFiles?: number;
  acceptedTypes?: string[];
  maxSizeBytes?: number;
  metadata?: Record<string, any>;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'compact' | 'button-only';
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  key: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

// Default accepted types for each upload type
const DEFAULT_ACCEPTED_TYPES = {
  evidence: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'],
  ticket: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  appeal: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  article: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],
  'server-icon': ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// Default size limits (in bytes)
const DEFAULT_SIZE_LIMITS = {
  evidence: 100 * 1024 * 1024, // 100MB
  ticket: 10 * 1024 * 1024,    // 10MB
  appeal: 10 * 1024 * 1024,    // 10MB
  article: 50 * 1024 * 1024,   // 50MB
  'server-icon': 5 * 1024 * 1024 // 5MB
};

export function MediaUpload({
  uploadType,
  onUploadComplete,
  onUploadStart,
  onUploadError,
  maxFiles = 5,
  acceptedTypes,
  maxSizeBytes,
  metadata = {},
  disabled = false,
  className,
  variant = 'default'
}: MediaUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { uploadMedia } = useMediaUpload();

  const allowedTypes = acceptedTypes || DEFAULT_ACCEPTED_TYPES[uploadType];
  const sizeLimit = maxSizeBytes || DEFAULT_SIZE_LIMITS[uploadType];

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (type.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (type === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };


  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return `File type ${file.type} is not supported. Allowed types: ${allowedTypes.join(', ')}`;
    }
    
    if (file.size > sizeLimit) {
      return `File size exceeds limit of ${formatFileSize(sizeLimit)}`;
    }
    
    return null;
  };

  const uploadFile = async (file: File): Promise<{ url: string; key: string } | null> => {
    try {
      // Use the hook's uploadMedia function which handles public/authenticated endpoints
      const result = await uploadMedia(file, uploadType, metadata);
      return result;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).slice(0, maxFiles - uploadedFiles.length);
    
    for (const file of newFiles) {
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setUploadedFiles(prev => [...prev, {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          url: '',
          key: '',
          status: 'error',
          progress: 0,
          error: validationError
        }]);
        continue;
      }

      // Add file to state with uploading status
      setUploadedFiles(prev => [...prev, {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        url: '',
        key: '',
        status: 'uploading',
        progress: 0
      }]);

      onUploadStart?.();

      try {
        // Start upload
        const result = await uploadFile(file);
        
        if (result) {
          // Update file status to success
          setUploadedFiles(prev => prev.map(f => 
            f.id === fileId 
              ? { ...f, status: 'success', progress: 100, url: result.url, key: result.key }
              : f
          ));
          
          onUploadComplete?.(result, file);
          
          toast({
            title: "Upload Successful",
            description: `${file.name} has been uploaded successfully.`,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        // Update file status to error
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, status: 'error', progress: 0, error: errorMessage }
            : f
        ));
        
        onUploadError?.(errorMessage);
        
        toast({
          title: "Upload Failed",
          description: `Failed to upload ${file.name}: ${errorMessage}`,
          variant: "destructive",
        });
      }
    }
  }, [uploadedFiles, maxFiles, onUploadComplete, onUploadStart, onUploadError, toast, uploadType, metadata]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const openFileDialog = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  if (variant === 'button-only') {
    return (
      <>
        <Button 
          type="button"
          onClick={(e) => openFileDialog(e)}
          disabled={disabled || uploadedFiles.length >= maxFiles}
          className={className}
          size="sm"
          variant="outline"
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Attach Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple={maxFiles > 1}
          accept={allowedTypes.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
        />
      </>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <input
        ref={fileInputRef}
        type="file"
        multiple={maxFiles > 1}
        accept={allowedTypes.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      {variant === 'compact' ? (
        <Button 
          type="button"
          onClick={(e) => openFileDialog(e)}
          disabled={disabled || uploadedFiles.length >= maxFiles}
          variant="outline"
          className="w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
      ) : (
        <Card 
          className={cn(
            "border-2 border-dashed transition-colors cursor-pointer",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={(e) => openFileDialog(e)}
        >
          <CardContent className="p-6 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop files here, or click to select files
            </p>
            <p className="text-xs text-muted-foreground">
              Maximum {maxFiles} files, up to {formatFileSize(sizeLimit)} each
            </p>
          </CardContent>
        </Card>
      )}

      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1">
                {file.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : file.status === 'success' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                
                {getFileIcon(file.type)}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="mt-1" />
                  )}
                  {file.status === 'error' && file.error && (
                    <p className="text-xs text-red-500 mt-1">{file.error}</p>
                  )}
                </div>
              </div>
              
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(file.id);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MediaUpload;