import { FocusShortcut } from "./FocusShortcut";
import { InboxShortcut } from "./InboxShortcut";
import { AccountMenu } from "./account/AccountMenu";
import type { Session } from "@/lib/auth/staffSession";
import type { AppRole } from "@/app/generated/prisma/client";

// Desktop counterpart to MobileNav's own top strip — Sidebar has no
// header row of its own, so this is the "top right" home for anything
// that isn't page navigation: the Focus Mode and Inbox Command
// shortcuts, and the account widget (avatar → Account Settings / Sign out).
export function TopBar({ role, session }: { role: AppRole; session: Session }) {
  return (
    <div className="hidden h-14 shrink-0 items-center justify-end gap-1 border-b border-border bg-panel px-4 md:flex">
      <FocusShortcut />
      <InboxShortcut role={role} />
      <AccountMenu
        userId={session.id}
        name={session.name}
        email={session.email}
        hasAvatar={Boolean(session.avatarPath)}
      />
    </div>
  );
}
