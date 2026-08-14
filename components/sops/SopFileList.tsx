"use client";

import { useState } from "react";
import { FileText, File as FileIcon, Download } from "lucide-react";
import { SopFileViewerModal, isDocx, type SopFileRef } from "./SopFileViewerModal";

type FileRow = SopFileRef & { sizeBytes: number };

function isPdf(f: FileRow): boolean {
  return f.mimeType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf");
}

function isViewable(f: FileRow): boolean {
  return isPdf(f) || isDocx(f);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Read-only file list — Word for drafts, PDF for final, told apart by
// icon/extension rather than a separate status field (per the user's
// own framing of the request). View shows for PDF and .docx (both
// renderable in the modal); legacy .doc still gets Download only.
export function SopFileList({ sopId, files }: { sopId: string; files: FileRow[] }) {
  const [viewing, setViewing] = useState<FileRow | null>(null);

  if (files.length === 0) {
    return (
      <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
        No files attached.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {files.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {isPdf(f) ? (
                <FileText size={18} className="shrink-0 text-status-critical" />
              ) : (
                <FileIcon size={18} className="shrink-0 text-accent" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm text-text">{f.fileName}</div>
                <div className="font-data text-[11px] text-text-faint">{formatSize(f.sizeBytes)}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isViewable(f) && (
                <button
                  type="button"
                  onClick={() => setViewing(f)}
                  className="min-h-9 rounded-md border border-border-strong px-3 text-xs text-text-muted hover:border-accent hover:text-text"
                >
                  View
                </button>
              )}
              <a
                href={`/api/sops/${sopId}/files/${f.id}?download=1`}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-text-faint hover:border-accent hover:text-text"
                aria-label={`Download ${f.fileName}`}
              >
                <Download size={15} />
              </a>
            </div>
          </div>
        ))}
      </div>
      {viewing && <SopFileViewerModal sopId={sopId} file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
