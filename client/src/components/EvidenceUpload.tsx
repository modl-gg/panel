import React, { useState } from 'react';
import { Shield, Upload, FileText, Image, Video, Eye, Trash2 } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@modl-gg/shared-web/components/ui/dialog';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import MediaUpload from './MediaUpload';
import { useMediaUpload } from '@/hooks/use-media-upload';

interface EvidenceItem {
  id: string;
  url: string;
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  category?: string;
}

interface EvidenceUploadProps {
  playerId?: string;
  ticketId?: string;
  category?: string;
  existingEvidence?: EvidenceItem[];
  onEvidenceUpdate?: (evidence: EvidenceItem[]) => void;
  readonly?: boolean;
}

export function EvidenceUpload({
  playerId,
  ticketId,
  category = 'general',
  existingEvidence = [],
  onEvidenceUpdate,
  readonly = false
}: EvidenceUploadProps) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>(existingEvidence);
  const [selectedMedia, setSelectedMedia] = useState<EvidenceItem | null>(null);
  const { config, deleteMedia } = useMediaUpload();
  const { toast } = useToast();

  const handleUploadComplete = (result: { url: string; key: string }, file?: File) => {
    // Use actual file info if available, otherwise extract from URL
    const fileName = file?.name || result.url.split('/').pop() || 'uploaded-file';
    
    const newEvidence: EvidenceItem = {
      id: Date.now().toString(),
      url: result.url,
      key: result.key,
      fileName: fileName,
      fileType: file?.type || 'application/octet-stream',
      fileSize: file?.size || 0,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Current User', // This should come from auth context
      category
    };

    const updatedEvidence = [...evidence, newEvidence];
    setEvidence(updatedEvidence);
    onEvidenceUpdate?.(updatedEvidence);

    toast({
      title: "Evidence Uploaded",
      description: `${fileName} has been uploaded successfully.`,
    });
  };

  const handleDeleteEvidence = async (evidenceItem: EvidenceItem) => {
    try {
      await deleteMedia(evidenceItem.key);
      const updatedEvidence = evidence.filter(e => e.id !== evidenceItem.id);
      setEvidence(updatedEvidence);
      onEvidenceUpdate?.(updatedEvidence);

      toast({
        title: "Evidence Deleted",
        description: `${evidenceItem.fileName} has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete evidence file.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (type.startsWith('video/')) return <Video className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
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
            <Shield className="h-5 w-5" />
            Evidence Upload
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
          <Shield className="h-5 w-5" />
          Evidence Upload
          {evidence.length > 0 && (
            <Badge variant="secondary">{evidence.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readonly && (
          <MediaUpload
            uploadType="evidence"
            onUploadComplete={handleUploadComplete}
            metadata={{
              playerId,
              ticketId,
              category
            }}
            variant="compact"
          />
        )}

        {evidence.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Uploaded Evidence</h4>
            {evidence.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  {getFileIcon(item.fileType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(item.fileSize)} • {new Date(item.uploadedAt).toLocaleDateString()}
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
                        <DialogTitle>{item.fileName}</DialogTitle>
                      </DialogHeader>
                      <div className="mt-4">
                        {isImage(item.fileType) ? (
                          <img 
                            src={item.url} 
                            alt={item.fileName}
                            className="max-w-full h-auto rounded-lg"
                          />
                        ) : isVideo(item.fileType) ? (
                          <video 
                            src={item.url} 
                            controls 
                            className="max-w-full h-auto rounded-lg"
                          />
                        ) : (
                          <div className="p-8 text-center">
                            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground mb-4">
                              Preview not available for this file type
                            </p>
                            <Button asChild>
                              <a href={item.url} target="_blank" rel="noopener noreferrer">
                                Download File
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {!readonly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEvidence(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EvidenceUpload;