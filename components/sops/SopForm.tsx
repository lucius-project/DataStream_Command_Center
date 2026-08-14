"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { AppRole } from "@/app/generated/prisma/client";

const ROLE_OPTIONS: AppRole[] = ["TECHNICIAN", "SERVICE_MANAGER", "CEO", "SDR"];
const ROLE_LABELS: Record<AppRole, string> = {
  TECHNICIAN: "Technician",
  SERVICE_MANAGER: "Service Manager",
  CEO: "CEO",
  SDR: "SDR",
};

export type ExistingSopFile = { id: string; fileName: string };

export type SopFormValues = {
  id?: string;
  title: string;
  body: string;
  taskArea: string;
  roles: AppRole[];
  existingFiles?: ExistingSopFile[];
};

// Shared by /sops/new and /sops/[id]/edit — one form, one save path,
// same "single source of truth for the shape of a SOP" reasoning as
// every other authoring form in this app (TechRolesForm, StaffUsersForm).
export function SopForm({ initial }: { initial: SopFormValues }) {
  const router = useRouter();
  const isEdit = Boolean(initial.id);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [taskArea, setTaskArea] = useState(initial.taskArea);
  const [roles, setRoles] = useState<AppRole[]>(initial.roles);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<ExistingSopFile[]>(initial.existingFiles ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function toggleRole(role: AppRole) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setNewFiles((prev) => [...prev, ...Array.from(fileList)]);
  }

  function removeNewFile(index: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Immediate, no confirm — removing one file from an SOP that still
  // exists is low-stakes (re-upload undoes it), unlike deleting the
  // whole entry below.
  async function removeExistingFile(fileId: string) {
    setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
    await fetch(`/api/sops/${initial.id}/files/${fileId}`, { method: "DELETE" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }
    if (roles.length === 0) {
      setError("Select at least one role.");
      return;
    }
    setBusy(true);
    const formData = new FormData();
    formData.set("title", title);
    formData.set("body", body);
    if (taskArea) formData.set("taskArea", taskArea);
    for (const role of roles) formData.append("roles", role);
    for (const file of newFiles) formData.append("files", file);

    // No Content-Type header — the browser sets the multipart boundary
    // itself when the body is a FormData; setting it manually breaks it.
    const res = await fetch(isEdit ? `/api/sops/${initial.id}` : "/api/sops", {
      method: isEdit ? "PATCH" : "POST",
      body: formData,
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save this SOP.");
      return;
    }
    router.push(isEdit ? `/sops/${initial.id}` : "/sops");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/sops/${initial.id}`, { method: "DELETE" });
    router.push("/sops");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Task area (optional grouping, e.g. &ldquo;Ticket Triage&rdquo;)</span>
        <input
          value={taskArea}
          onChange={(e) => setTaskArea(e.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Description</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="font-data text-xs text-text-faint">Files (PDF or Word — Word for drafts, PDF once final)</span>

        {existingFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {existingFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-raised px-3 py-2">
                <span className="truncate text-sm text-text">{f.fileName}</span>
                <button
                  type="button"
                  onClick={() => removeExistingFile(f.id)}
                  aria-label={`Remove ${f.fileName}`}
                  className="shrink-0 rounded p-1 text-text-faint hover:bg-panel hover:text-status-critical"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {newFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {newFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-accent/40 bg-panel-raised px-3 py-2">
                <span className="truncate text-sm text-text">{f.name} (new)</span>
                <button
                  type="button"
                  onClick={() => removeNewFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 rounded p-1 text-text-faint hover:bg-panel hover:text-status-critical"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="text-sm text-text-muted file:mr-3 file:min-h-9 file:rounded-md file:border file:border-border-strong file:bg-panel-raised file:px-3 file:text-sm file:text-text-muted hover:file:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-data text-xs text-text-faint">Applies to</span>
        <div className="flex flex-wrap gap-3">
          {ROLE_OPTIONS.map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-sm text-text">
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </div>

      {error && <div className="text-xs text-status-critical">{error}</div>}

      <div className="flex items-center justify-between gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
        >
          {isEdit ? "Save changes" : "Create SOP"}
        </button>

        {isEdit &&
          (!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-10 rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-status-critical hover:text-status-critical"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-status-critical">Delete this SOP?</span>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="min-h-9 rounded-md bg-status-critical px-3 text-xs font-medium text-bg disabled:opacity-50"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-9 rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          ))}
      </div>
    </form>
  );
}
