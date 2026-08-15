"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Avatar } from "./Avatar";
import { SignOutButton } from "../SignOutButton";

// Top-right account widget — avatar/initials trigger a dropdown with
// Account Settings + Sign out. Closing on outside click reuses this
// app's existing "full-screen transparent button behind the panel"
// convention (see InfoButton.tsx's modal), just at dropdown scale.
export function AccountMenu({
  userId,
  name,
  email,
  hasAvatar,
  onNavigate,
}: {
  userId: string;
  name: string;
  email: string;
  hasAvatar: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    onNavigate?.();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-panel-raised"
      >
        <Avatar userId={userId} name={name} hasAvatar={hasAvatar} size={30} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-panel p-1.5 shadow-xl">
            <div className="border-b border-border px-2.5 py-2">
              <div className="truncate font-display text-sm font-semibold text-text">{name}</div>
              <div className="truncate text-xs text-text-faint">{email}</div>
            </div>
            <div className="flex flex-col gap-0.5 pt-1.5">
              <Link
                href="/account"
                onClick={close}
                className="flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm text-text-muted hover:bg-panel-raised hover:text-text"
              >
                <Settings size={15} />
                Account Settings
              </Link>
              <SignOutButton label="Sign out" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
