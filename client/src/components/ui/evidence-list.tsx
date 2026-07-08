import { useTranslation } from 'react-i18next';
import { FileText, Upload } from 'lucide-react';
import { openExternalUrl, safeExternalHref } from '@/lib/utils';
import { getTrustedEvidenceMediaType, normalizeCdnHost } from '@/utils/evidence-utils';
import { formatDateWithTime } from '@/utils/date-utils';
import { useMediaUploadConfig } from '@/hooks/use-media-upload';

export interface EvidenceEntry {
  text?: string;
  type?: string;
  url?: string;
  uploadedBy?: string;
  uploadedById?: string;
  uploadedAt?: string;
  issuerName?: string;
  date?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export type EvidenceValue = string | EvidenceEntry;

export interface EvidenceListProps {
  evidence?: EvidenceValue[];
  className?: string;
}

interface NormalizedEvidence {
  text: string;
  issuerInfo: string;
  type: string;
  fileUrl: string;
  fileName: string;
}

function normalizeEvidence(item: EvidenceValue): NormalizedEvidence {
  if (typeof item === 'string') {
    return {
      text: item,
      issuerInfo: 'By: System on Unknown',
      type: item.match(/^https?:\/\//) ? 'url' : 'text',
      fileUrl: '',
      fileName: '',
    };
  }

  const issuer = item.uploadedBy || item.issuerName || 'System';
  const dateValue = item.uploadedAt || item.date;
  const date = dateValue ? formatDateWithTime(dateValue) : 'Unknown';
  const type = item.type || 'text';
  const fileUrl = item.url || item.fileUrl || '';
  const fileName = item.fileName || '';
  const text = item.text || (fileUrl && type === 'url' ? fileUrl : '');

  return {
    text,
    issuerInfo: `By: ${issuer} on ${date}`,
    type,
    fileUrl,
    fileName,
  };
}

function EvidenceListItem({ item, cdnHost }: { item: EvidenceValue; cdnHost: string | null }) {
  const { t } = useTranslation();
  const { text, issuerInfo, type, fileUrl, fileName } = normalizeEvidence(item);

  const detectionUrl = type === 'file' ? fileUrl : text;
  const mediaType = type === 'url' || type === 'file' ? getTrustedEvidenceMediaType(detectionUrl, cdnHost) : 'text';
  const fileHref = safeExternalHref(fileUrl);
  const evidenceHref = safeExternalHref(text);

  return (
    <li className="bg-muted/20 p-2 rounded text-xs border-l-2 border-blue-500">
      <div className="flex items-start">
        <FileText className="h-3 w-3 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {type === 'file' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('player.file')}:</span>
                <a
                  href={fileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  <Upload className="h-3 w-3" />
                  {fileName || 'Unknown file'}
                </a>
              </div>
              {text && text !== fileName && (
                <div className="text-muted-foreground">{text}</div>
              )}
              {mediaType === 'image' && (
                <img
                  src={fileHref}
                  alt="Evidence"
                  className="max-w-full max-h-48 rounded border cursor-pointer"
                  style={{ maxWidth: '300px' }}
                  onClick={() => openExternalUrl(fileUrl)}
                />
              )}
              {mediaType === 'video' && (
                <video
                  src={fileHref}
                  controls
                  className="max-w-full max-h-48 rounded border"
                  style={{ maxWidth: '300px' }}
                />
              )}
              {mediaType === 'link' && (
                <a
                  href={fileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all"
                >
                  {t('upload.downloadFile')}
                </a>
              )}
            </div>
          ) : mediaType === 'image' ? (
            <img
              src={evidenceHref}
              alt="Evidence"
              className="max-w-full max-h-48 rounded border"
              style={{ maxWidth: '300px' }}
            />
          ) : mediaType === 'video' ? (
            <video
              src={evidenceHref}
              controls
              className="max-w-full max-h-48 rounded border"
              style={{ maxWidth: '300px' }}
            />
          ) : type === 'url' ? (
            <a
              href={evidenceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline break-all"
            >
              {text}
            </a>
          ) : (
            <span className="break-all">{text}</span>
          )}
          <p className="text-muted-foreground text-xs mt-1">{issuerInfo}</p>
        </div>
      </div>
    </li>
  );
}

export function EvidenceList({ evidence, className }: EvidenceListProps) {
  const { t } = useTranslation();
  const { data: mediaConfig } = useMediaUploadConfig();
  const cdnHost = normalizeCdnHost(mediaConfig?.cdnDomain);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">{t('punishment.evidence')}:</p>
      </div>
      {evidence && evidence.length > 0 ? (
        <ul className="text-xs space-y-2">
          {evidence.map((item, idx) => (
            <EvidenceListItem key={idx} item={item} cdnHost={cdnHost} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('player.noEvidence')}</p>
      )}
    </div>
  );
}
