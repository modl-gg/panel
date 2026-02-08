import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { getApiUrl } from "@/lib/api";
import { Loader2, Upload, X, CheckCircle, AlertCircle, FileIcon } from "lucide-react";

interface TokenInfo {
  punishmentId: string;
  playerName: string;
  issuerName: string;
}

interface UploadedFile {
  file: File;
  url: string;
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  progress: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
}

function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    headers: {
      ...options.headers,
    },
  });
}

export default function UploadEvidencePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    validateToken();
  }, [token]);

  async function validateToken() {
    try {
      const response = await apiFetch(`/v1/public/evidence-upload/${token}`);
      const data = await response.json();

      if (data.status === 200) {
        setTokenInfo({
          punishmentId: data.punishmentId,
          playerName: data.playerName,
          issuerName: data.issuerName,
        });
      } else {
        setError(data.message || "Invalid or expired upload token");
      }
    } catch {
      setError("Failed to validate upload token");
    } finally {
      setLoading(false);
    }
  }

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      if (!token || submitted) return;

      const uploadEntries: UploadedFile[] = newFiles.map((file) => ({
        file,
        url: "",
        key: "",
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        progress: 0,
        status: "pending" as const,
      }));

      setFiles((prev) => [...prev, ...uploadEntries]);

      // Upload each file
      for (let i = 0; i < uploadEntries.length; i++) {
        const entry = uploadEntries[i];
        const fileIndex = files.length + i;

        try {
          // Update status to uploading
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === fileIndex ? { ...f, status: "uploading" as const } : f
            )
          );

          // Get presigned URL
          const presignResponse = await apiFetch(
            `/v1/public/evidence-upload/${token}/presign`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: entry.file.name,
                contentType: entry.file.type,
                fileSize: entry.file.size,
              }),
            }
          );

          const presignData = await presignResponse.json();
          if (presignData.status !== 200) {
            throw new Error(presignData.message || "Failed to get upload URL");
          }

          // Upload to S3 via XHR for progress tracking
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (event) => {
              if (event.lengthComputable) {
                const percentage = Math.round(
                  (event.loaded / event.total) * 100
                );
                setFiles((prev) =>
                  prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, progress: percentage } : f
                  )
                );
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
              }
            });

            xhr.addEventListener("error", () =>
              reject(new Error("Network error"))
            );
            xhr.addEventListener("abort", () =>
              reject(new Error("Upload aborted"))
            );

            xhr.open(presignData.method || "PUT", presignData.presignedUrl, true);

            const unsafeHeaders = [
              "content-length",
              "host",
              "connection",
              "accept-encoding",
            ];
            if (presignData.requiredHeaders) {
              Object.entries(
                presignData.requiredHeaders as Record<string, string>
              ).forEach(([key, value]) => {
                if (!unsafeHeaders.includes(key.toLowerCase())) {
                  xhr.setRequestHeader(key, value);
                }
              });
            }

            xhr.send(entry.file);
          });

          // Confirm upload
          const confirmResponse = await apiFetch(
            `/v1/public/evidence-upload/${token}/confirm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: presignData.key }),
            }
          );

          const confirmData = await confirmResponse.json();
          if (confirmData.status !== 200) {
            throw new Error(
              confirmData.message || "Failed to confirm upload"
            );
          }

          // Mark as uploaded
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === fileIndex
                ? {
                    ...f,
                    status: "uploaded" as const,
                    progress: 100,
                    url: confirmData.url,
                    key: confirmData.key,
                  }
                : f
            )
          );
        } catch (err) {
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === fileIndex
                ? {
                    ...f,
                    status: "error" as const,
                    error:
                      err instanceof Error ? err.message : "Upload failed",
                  }
                : f
            )
          );
        }
      }
    },
    [token, files.length, submitted]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!token || submitting || submitted) return;

    const uploadedFiles = files.filter((f) => f.status === "uploaded");
    if (uploadedFiles.length === 0) return;

    setSubmitting(true);

    try {
      const response = await apiFetch(
        `/v1/public/evidence-upload/${token}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evidence: uploadedFiles.map((f) => ({
              url: f.url,
              fileName: f.fileName,
              fileType: f.fileType,
              fileSize: f.fileSize,
            })),
          }),
        }
      );

      const data = await response.json();
      if (data.status === 200) {
        setSubmitted(true);
      } else {
        setError(data.message || "Failed to submit evidence");
      }
    } catch {
      setError("Failed to submit evidence");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (submitted) return;
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        handleFiles(droppedFiles);
      }
    },
    [handleFiles, submitted]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const uploadedCount = files.filter((f) => f.status === "uploaded").length;
  const hasErrors = files.some((f) => f.status === "error");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !tokenInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center max-w-md p-8">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Upload Unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center max-w-md p-8">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Evidence Uploaded</h1>
          <p className="text-muted-foreground">
            {uploadedCount} file(s) have been attached to punishment #
            {tokenInfo?.punishmentId}. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 pt-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Upload Evidence</h1>
          <div className="text-muted-foreground space-y-1">
            <p>
              Punishment:{" "}
              <span className="text-foreground font-mono">
                #{tokenInfo?.punishmentId}
              </span>
            </p>
            <p>
              Player:{" "}
              <span className="text-foreground">{tokenInfo?.playerName}</span>
            </p>
            <p>
              Uploaded by:{" "}
              <span className="text-foreground">{tokenInfo?.issuerName}</span>
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-1">
            Drag and drop files here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Images, videos, PDFs up to 100MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                handleFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-6 space-y-3">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <FileIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.fileSize / 1024 / 1024).toFixed(2)} MB
                    {f.status === "uploading" && ` - ${f.progress}%`}
                    {f.status === "uploaded" && " - Uploaded"}
                    {f.status === "error" && ` - ${f.error}`}
                  </p>
                  {f.status === "uploading" && (
                    <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {f.status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {f.status === "uploaded" && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {f.status === "error" && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  {(f.status === "uploaded" || f.status === "error") && (
                    <button
                      onClick={() => removeFile(idx)}
                      className="ml-2 p-1 hover:bg-muted rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Submit button */}
        {uploadedCount > 0 && (
          <div className="mt-6">
            <button
              onClick={handleSubmit}
              disabled={submitting || uploadedCount === 0}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Evidence...
                </>
              ) : (
                <>
                  Save {uploadedCount} Evidence File
                  {uploadedCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
            {hasErrors && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Files with errors will not be included
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
