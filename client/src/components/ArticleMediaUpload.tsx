import React, { useState } from 'react';
import { Image as ImageIcon, Video, Upload, Copy, Check, Trash2 } from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'modl-shared-web/components/ui/card';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { useToast } from 'modl-shared-web/hooks/use-toast';
import { Input } from 'modl-shared-web/components/ui/input';
import { Label } from 'modl-shared-web/components/ui/label';
import MediaUpload from './MediaUpload';
import { useMediaUpload } from '@/hooks/use-media-upload';

interface ArticleMedia {
  id: string;
  url: string;
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  altText?: string;
}

interface ArticleMediaUploadProps {
  articleId?: string;
  articleSlug?: string;
  existingMedia?: ArticleMedia[];
  onMediaUpdate?: (media: ArticleMedia[]) => void;
  onInsertMedia?: (mediaUrl: string, altText?: string) => void;
  readonly?: boolean;
}

export function ArticleMediaUpload({
  articleId,
  articleSlug,
  existingMedia = [],
  onMediaUpdate,
  onInsertMedia,
  readonly = false
}: ArticleMediaUploadProps) {
  const [media, setMedia] = useState<ArticleMedia[]>(existingMedia);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const { config, deleteMedia } = useMediaUpload();
  const { toast } = useToast();

  const handleUploadComplete = (result: { url: string; key: string }, file?: File) => {
    // Use actual file info if available, otherwise extract from URL
    const fileName = file?.name || result.url.split('/').pop() || 'uploaded-file';
    
    const newMedia: ArticleMedia = {
      id: Date.now().toString(),
      url: result.url,
      key: result.key,
      fileName: fileName,
      fileType: file?.type || 'image/jpeg',
      fileSize: file?.size || 0,
      uploadedAt: new Date().toISOString(),
      altText: fileName.split('.')[0] // Use filename without extension as default alt text
    };

    const updatedMedia = [...media, newMedia];
    setMedia(updatedMedia);
    onMediaUpdate?.(updatedMedia);

    toast({
      title: "Media Uploaded",
      description: `${fileName} has been uploaded successfully.`,
    });
  };

  const handleDeleteMedia = async (mediaItem: ArticleMedia) => {
    try {
      await deleteMedia(mediaItem.key);
      const updatedMedia = media.filter(m => m.id !== mediaItem.id);
      setMedia(updatedMedia);
      onMediaUpdate?.(updatedMedia);

      toast({
        title: "Media Deleted",
        description: `${mediaItem.fileName} has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete media file.",
        variant: "destructive",
      });
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
      
      toast({
        title: "URL Copied",
        description: "Media URL has been copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy URL to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleInsertMedia = (mediaItem: ArticleMedia) => {
    if (onInsertMedia) {
      onInsertMedia(mediaItem.url, mediaItem.altText);
      toast({
        title: "Media Inserted",
        description: `${mediaItem.fileName} has been inserted into the article.`,
      });
    }
  };

  const updateAltText = (mediaId: string, altText: string) => {
    const updatedMedia = media.map(m => 
      m.id === mediaId ? { ...m, altText } : m
    );
    setMedia(updatedMedia);
    onMediaUpdate?.(updatedMedia);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isImage = (type: string) => type.startsWith('image/');
  const isVideo = (type: string) => type.startsWith('video/');

  if (!config?.wasabiConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Article Media
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Media storage is not configured. Please contact your administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Article Media
          {media.length > 0 && (
            <Badge variant="secondary">{media.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readonly && (
          <MediaUpload
            uploadType="article"
            onUploadComplete={handleUploadComplete}
            metadata={{
              articleId,
              articleSlug
            }}
            variant="compact"
            maxFiles={20}
          />
        )}

        {media.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Uploaded Media</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {media.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center relative">
                    {isImage(item.fileType) ? (
                      <img 
                        src={item.url} 
                        alt={item.altText || item.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : isVideo(item.fileType) ? (
                      <video 
                        src={item.url} 
                        className="w-full h-full object-cover"
                        controls
                      />
                    ) : (
                      <div className="text-center">
                        <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Preview not available</p>
                      </div>
                    )}
                    
                    {!readonly && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => handleDeleteMedia(item)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  
                  <CardContent className="p-3 space-y-3">
                    <div>
                      <p className="text-sm font-medium truncate">{item.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(item.fileSize)} • {new Date(item.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {!readonly && (
                      <div className="space-y-2">
                        <Label htmlFor={`alt-${item.id}`} className="text-xs">
                          Alt Text
                        </Label>
                        <Input
                          id={`alt-${item.id}`}
                          value={item.altText || ''}
                          onChange={(e) => updateAltText(item.id, e.target.value)}
                          placeholder="Describe this image..."
                          className="h-8 text-xs"
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => handleCopyUrl(item.url)}
                      >
                        {copiedUrl === item.url ? (
                          <Check className="h-3 w-3 mr-1" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1" />
                        )}
                        {copiedUrl === item.url ? 'Copied!' : 'Copy URL'}
                      </Button>
                      
                      {onInsertMedia && !readonly && (
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleInsertMedia(item)}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Insert
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ArticleMediaUpload;