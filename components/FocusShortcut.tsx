import Link from "next/link";
import { Timer } from "lucide-react";

// Quick-access shortcut to Focus Mode, placed next to the Inbox Command
// shortcut in the top bar — moved here from the (now-removed) Personal
// nav group, same "extra way in, not a separate access rule" reasoning
// as InboxShortcut. No role gate: /focus only requires being signed in
// (see app/focus/page.tsx's requireSignedIn call), unlike Inbox Command's
// SERVICE_MANAGER+ gate.
export function FocusShortcut() {
  return (
    <Link
      href="/focus"
      aria-label="Focus Mode"
      className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
    >
      <Timer size={17} />
    </Link>
  );
}
