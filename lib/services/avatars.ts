import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// data/avatars/ — same local-first, gitignored (/data/ in .gitignore)
// storage convention as data/sop-files/. Never public/ — avatars are
// served through a signed-in-only route, not left world-readable.
const STORAGE_ROOT = path.join(process.cwd(), "data", "avatars");

const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — a profile picture, not a document

export class AvatarValidationError extends Error {}

function extensionFor(file: File): string | null {
  const ext = path.extname(file.name).toLowerCase();
  return ext in ALLOWED_EXTENSIONS ? ext : null;
}

export function mimeTypeForPath(storagePath: string): string {
  const ext = path.extname(storagePath).toLowerCase();
  return ALLOWED_EXTENSIONS[ext] ?? "application/octet-stream";
}

export function resolveAvatarPath(storagePath: string): string {
  return path.join(STORAGE_ROOT, storagePath);
}

// Replaces whatever avatar the user already had — one picture per
// person, no history — deleting the old file on disk before writing
// the new one so data/avatars/ doesn't accumulate orphans.
export async function saveAvatar(userId: string, file: File): Promise<string> {
  const ext = extensionFor(file);
  if (!ext) {
    throw new AvatarValidationError(`"${file.name}" isn't a supported image type (jpg, png, webp, gif).`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AvatarValidationError(`"${file.name}" is too large (5MB max).`);
  }

  const existing = await prisma.staffUser.findUnique({ where: { id: userId }, select: { avatarPath: true } });

  await mkdir(STORAGE_ROOT, { recursive: true });
  const storagePath = `${userId}-${randomBytes(6).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(STORAGE_ROOT, storagePath), buffer);

  await prisma.staffUser.update({ where: { id: userId }, data: { avatarPath: storagePath } });

  if (existing?.avatarPath) {
    await unlink(resolveAvatarPath(existing.avatarPath)).catch(() => {});
  }

  return storagePath;
}

export async function deleteAvatar(userId: string): Promise<void> {
  const existing = await prisma.staffUser.findUnique({ where: { id: userId }, select: { avatarPath: true } });
  if (!existing?.avatarPath) return;

  await prisma.staffUser.update({ where: { id: userId }, data: { avatarPath: null } });
  await unlink(resolveAvatarPath(existing.avatarPath)).catch(() => {});
}
