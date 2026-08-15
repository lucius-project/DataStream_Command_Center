"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";

// Name/email come from Microsoft SSO and are overwritten on every
// login (see app/api/auth/staff/callback/route.ts) — the picture is
// the only genuinely account-owned setting, so this is the whole form.
export function AvatarUploadForm({
  userId,
  name,
  hasAvatar: initialHasAvatar,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
}) {
  const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("avatar", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed.");
      }
      setHasAvatar(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove picture.");
      setHasAvatar(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar userId={userId} name={name} hasAvatar={hasAvatar} size={64} />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
          >
            {hasAvatar ? "Change picture" : "Upload picture"}
          </button>
          {hasAvatar && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />
        {error && <div className="text-xs text-status-critical">{error}</div>}
        <div className="text-xs text-text-faint">JPG, PNG, WEBP, or GIF. 5MB max.</div>
      </div>
    </div>
  );
}
