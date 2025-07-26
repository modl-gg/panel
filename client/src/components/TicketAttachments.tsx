import React, { useState } from 'react';
import { Paperclip, Download, Eye, Trash2, FileText, Image, Video, File } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@modl-gg/shared-web/components/ui/dialog';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import MediaUpload from './MediaUpload';
import { useMediaUpload } from '@/hooks/use-media-upload';

interface TicketAttachment {
  id: string;
  url: string;
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
}

interface TicketAttachmentsProps {
  ticketId: string;
  ticketType?: string;
  existingAttachments?: TicketAttachment[];
  onAttachmentsUpdate?: (attachments: TicketAttachment[]) => void;
  readonly?: boolean;
  showTitle?: boolean;
  publicMode?: boolean; // When true, disables delete functionality
}

export function TicketAttachments({
  ticketId,
  ticketType = 'general',
  existingAttachments = [],
  onAttachmentsUpdate,
  readonly = false,
  showTitle = true,
  compact = false,
  publicMode = false
}: TicketAttachmentsProps & { compact?: boolean }) {
  const [attachments, setAttachments] = useState<TicketAttachment[]>(existingAttachments);
  const { config, deleteMedia } = useMediaUpload();
  const { toast } = useToast();

  const handleUploadComplete = (result: { url: string; key: string }, file?: File) => {
    // Use actual file info if available, otherwise extract from URL
    const fileName = file?.name || result.url.split('/').pop() || 'uploaded-file';
    
    const newAttachment: TicketAttachment = {
      id: Date.now().toString(),
      url: result.url,
      key: result.key,
      fileName: fileName,
      fileType: file?.type || 'application/octet-stream',
      fileSize: file?.size || 0,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Current User' // This should come from auth context
    };

    const updatedAttachments = [...attachments, newAttachment];
    setAttachments(updatedAttachments);
    onAttachmentsUpdate?.(updatedAttachments);

    toast({
      title: "Attachment Uploaded",
      description: `${fileName} has been uploaded successfully.`,
    });
  };

  const handleDeleteAttachment = async (attachment: TicketAttachment) => {
    if (publicMode) {
      // In public mode, just remove from local state (no server deletion)
      const updatedAttachments = attachments.filter(a => a.id !== attachment.id);
      setAttachments(updatedAttachments);
      onAttachmentsUpdate?.(updatedAttachments);

      toast({
        title: "Attachment Removed",
        description: `${attachment.fileName} has been removed from this session.`,
      });
      return;
    }

    try {
      await deleteMedia(attachment.key);
      const updatedAttachments = attachments.filter(a => a.id !== attachment.id);
      setAttachments(updatedAttachments);
      onAttachmentsUpdate?.(updatedAttachments);

      toast({
        title: "Attachment Deleted",
        description: `${attachment.fileName} has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete attachment.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (type.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (type === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
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
  const isPdf = (type: string) => type === 'application/pdf';

  if (!config?.wasabiConfigured) {
    return (
      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          File attachments are not available. Media storage is not configured.
        </p>
      </div>
    );
  }

  const content = (
    <div className={compact ? "flex items-center gap-2" : "space-y-4"}>
      {!readonly && (
        <MediaUpload
          uploadType="ticket"
          onUploadComplete={handleUploadComplete}
          metadata={{
            ticketId,
            ticketType
          }}
          variant={compact ? "button-only" : "compact"}
          maxFiles={10}
        />
      )}

      {attachments.length > 0 && (
        <div className={compact ? "flex items-center gap-2 flex-wrap" : "space-y-2"}>
          {!compact && showTitle && <h4 className="text-sm font-medium">Attachments</h4>}
          {compact ? (
            <>
              {attachments.map((attachment) => {
                // Truncate filename to max 20 characters
                const truncatedName = attachment.fileName.length > 20 
                  ? attachment.fileName.substring(0, 17) + '...'
                  : attachment.fileName;
                
                return (
                  <Badge 
                    key={attachment.id} 
                    variant="secondary" 
                    className="flex items-center gap-1 max-w-fit"
                  >
                    {getFileIcon(attachment.fileType)}
                    <span className="text-xs">{truncatedName}</span>
                    {!readonly && (
                      <button
                        onClick={() => handleDeleteAttachment(attachment)}
                        className="ml-1 hover:bg-destructive/10 rounded-sm p-0.5"
                        title={publicMode ? `Remove ${attachment.fileName}` : `Delete ${attachment.fileName}`}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </Badge>
                );
              })}
            </>
          ) : (
            <>
              {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1">
                {getFileIcon(attachment.fileType)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSize)} • {new Date(attachment.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>{attachment.fileName}</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                      {isImage(attachment.fileType) ? (
                        <img 
                          src={attachment.url} 
                          alt={attachment.fileName}
                          className="max-w-full h-auto rounded-lg"
                        />
                      ) : isVideo(attachment.fileType) ? (
                        <video 
                          src={attachment.url} 
                          controls 
                          className="max-w-full h-auto rounded-lg"
                        />
                      ) : isPdf(attachment.fileType) ? (
                        <iframe
                          src={attachment.url}
                          className="w-full h-96 rounded-lg"
                          title={attachment.fileName}
                        />
                      ) : (
                        <div className="p-8 text-center">
                          <File className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground mb-4">
                            Preview not available for this file type
                          </p>
                          <Button asChild>
                            <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 mr-2" />
                              Download File
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <Button variant="ghost" size="sm" asChild>
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>

                {!readonly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAttachment(attachment)}
                    title={publicMode ? "Remove attachment" : "Delete attachment"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );

  if (showTitle) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Attachments
            {attachments.length > 0 && (
              <Badge variant="secondary">{attachments.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    );
  }

  return content;
}

export default TicketAttachments;