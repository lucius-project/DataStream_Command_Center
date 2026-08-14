"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { renderAsync } from "docx-preview";

export type SopFileRef = { id: string; fileName: string; mimeType: string };

function isPdf(file: SopFileRef): boolean {
  return file.mimeType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");
}

// docx-preview only understands the modern .docx (OOXML) format, not
// the legacy binary .doc format that predates it — a real format-level
// limitation, not a bug to route around. Word Online itself was the
// original ask here, but it needs a publicly reachable URL for
// Microsoft's servers to fetch (this app only runs on localhost) and
// would need an unauthenticated link to the file either way, undermining
// the role-gating this whole feature is built on — this renders
// entirely client-side instead, through the same authenticated fetch
// the PDF viewer already uses, no public exposure required.
export function isDocx(file: SopFileRef): boolean {
  return (
    file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.fileName.toLowerCase().endsWith(".docx")
  );
}

function DocxPreview({ viewUrl }: { viewUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No synchronous setLoading(true)/setError(null) reset here — the
    // initial useState values already represent "loading, no error,"
    // and this component fully unmounts/remounts per file (SopFileList
    // toggles {viewing && <SopFileViewerModal .../>}, not a key swap on
    // a persistent instance), so there's never a stale prior state to
    // clear.
    let cancelled = false;

    fetch(viewUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled || !containerRef.current) return undefined;
        return renderAsync(blob, containerRef.current, containerRef.current, { inWrapper: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render this document.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewUrl]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-muted">Couldn&apos;t render this document: {error}</p>
        <a
          href={`${viewUrl}?download=1`}
          className="rounded-md bg-accent px-4 py-2 font-display text-sm font-medium text-bg hover:bg-accent-strong"
        >
          Download instead
        </a>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-panel-raised p-4">
      {loading && <div className="text-center text-sm text-text-muted">Loading…</div>}
      <div ref={containerRef} />
    </div>
  );
}

// Same modal shell as ActivityTimelineModal.tsx (fixed inset-0 backdrop
// + relative panel + X close). PDFs render via the browser's own native
// PDF viewer inside an iframe (full scroll/zoom/print for free, no
// PDF.js dependency needed); .docx renders via DocxPreview above.
// Legacy .doc gets an honest "can't preview this" message — no
// available renderer for that format.
export function SopFileViewerModal({ sopId, file, onClose }: { sopId: string; file: SopFileRef; onClose: () => void }) {
  const viewUrl = `/api/sops/${sopId}/files/${file.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="truncate font-display text-sm font-semibold text-text">{file.fileName}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {isPdf(file) ? (
            <iframe src={viewUrl} title={file.fileName} className="h-full w-full" />
          ) : isDocx(file) ? (
            <DocxPreview viewUrl={viewUrl} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-text-muted">
                Preview isn&apos;t available for this file — only PDF and .docx can be rendered (legacy .doc isn&apos;t
                supported).
              </p>
              <a
                href={`${viewUrl}?download=1`}
                className="rounded-md bg-accent px-4 py-2 font-display text-sm font-medium text-bg hover:bg-accent-strong"
              >
                Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
