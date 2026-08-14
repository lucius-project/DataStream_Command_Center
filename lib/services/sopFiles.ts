import { writeFile, unlink, mkdir, rm } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { SopFile } from "@/app/generated/prisma/client";

// data/sop-files/ — sibling of data/dev.db, same local-first, gitignored
// (/data/ in .gitignore) storage this app already uses for its SQLite
// database. Never public/ — that's served unauthenticated by Next.js
// directly, and these files are role-gated (see the file-serving route).
const STORAGE_ROOT = path.join(process.cwd(), "data", "sop-files");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export class SopFileValidationError extends Error {}

// Strips path separators and anything else that isn't a safe filename
// character — this alone rules out path traversal (no "/" survives to
// form a real path segment), not just a cosmetic cleanup.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

function isAllowedFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  // Some browsers/OS upload dialogs don't set a reliable MIME type —
  // fall back to the extension rather than rejecting a legitimate file.
  const ext = path.extname(file.name).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export async function saveUploadedFile(sopEntryId: string, file: File): Promise<SopFile> {
  if (!isAllowedFile(file)) {
    throw new SopFileValidationError(`"${file.name}" isn't a PDF or Word document.`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new SopFileValidationError(`"${file.name}" is too large (25MB max).`);
  }

  const dir = path.join(STORAGE_ROOT, sopEntryId);
  await mkdir(dir, { recursive: true });
  const storageFileName = `${randomBytes(8).toString("hex")}-${sanitizeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, storageFileName), buffer);

  return prisma.sopFile.create({
    data: {
      sopEntryId,
      fileName: file.name,
      mimeType: file.type || (path.extname(file.name).toLowerCase() === ".pdf" ? "application/pdf" : "application/octet-stream"),
      sizeBytes: file.size,
      storagePath: path.join(sopEntryId, storageFileName),
    },
  });
}

export function resolveSopFilePath(storagePath: string): string {
  return path.join(STORAGE_ROOT, storagePath);
}

// Best-effort on disk — a file already missing on disk shouldn't block
// removing the DB row (e.g. if someone manually cleared the storage dir).
export async function deleteSopFile(id: string): Promise<void> {
  const file = await prisma.sopFile.findUnique({ where: { id } });
  if (!file) return;
  await prisma.sopFile.delete({ where: { id } });
  await unlink(resolveSopFilePath(file.storagePath)).catch(() => {});
}

// Called before deleting a SopEntry — Prisma's onDelete: Cascade cleans
// up the SopFile DB rows automatically, but only this cleans up the
// actual files on disk.
export async function deleteAllFilesForSop(sopEntryId: string): Promise<void> {
  // Removes the whole per-entry directory (not just each file) so
  // deleting a SOP's last file, or the SOP itself, doesn't leave an
  // empty directory behind under data/sop-files/.
  await rm(path.join(STORAGE_ROOT, sopEntryId), { recursive: true, force: true }).catch(() => {});
}
