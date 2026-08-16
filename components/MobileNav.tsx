"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";
import { FocusShortcut } from "./FocusShortcut";
import { InboxShortcut } from "./InboxShortcut";
import { AccountMenu } from "./account/AccountMenu";
import type { Session } from "@/lib/auth/staffSession";
import type { AppRole } from "@/app/generated/prisma/client";

export function MobileNav({ role, session }: { role: AppRole; session: Session }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <div className="flex h-14 items-center gap-3 border-b border-border bg-panel px-3">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted active:bg-panel-raised"
        >
          <Menu size={22} />
        </button>
        <span className="h-2 w-2 rounded-full bg-status-ok" />
        <span className="font-display text-sm font-semibold tracking-wide text-text">
          DATASTREAM
        </span>
        <div className="ml-auto flex items-center gap-1">
          <FocusShortcut />
          <InboxShortcut role={role} />
          <ThemeToggle />
          <AccountMenu
            userId={session.id}
            name={session.name}
            email={session.email}
            hasAvatar={Boolean(session.avatarPath)}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex w-72 max-w-[85vw] flex-col bg-panel">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <span className="font-display text-sm font-semibold tracking-wide text-text">
                DATASTREAM
              </span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted active:bg-panel-raised"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-4">
              <NavLinks role={role} onNavigate={() => setOpen(false)} />
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60"
          />
        </div>
      )}
    </div>
  );
}
