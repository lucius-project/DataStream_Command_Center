"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Root error boundary — catches any otherwise-unhandled throw from a page
// or its data fetching, so a bug shows this instead of Next's raw default
// error screen. Sidebar/MobileNav (app/layout.tsx) stay mounted since this
// only replaces the page content, not the whole layout — a real difference
// from app/global-error.tsx, which would replace <html> itself and is only
// for errors in the root layout, not needed here.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Same convention every sync function in lib/integrations/lib/services
    // already uses (console.error, no external error-tracking service
    // configured in this app) — see e.g. lib/integrations/halopsa.ts.
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 p-6 pt-24 text-center">
      <AlertTriangle className="text-status-critical" size={32} />
      <h1 className="font-display text-lg font-semibold text-text">Something went wrong</h1>
      <p className="text-sm text-text-muted">
        This page hit an unexpected error. Try again, or head back to Business Health if it keeps happening.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex min-h-11 items-center rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong"
        >
          Try again
        </button>
        <Link
          href="/business-health"
          className="flex min-h-11 items-center rounded-md border border-border-strong px-4 font-display text-sm font-medium text-text hover:border-accent"
        >
          Business Health
        </Link>
      </div>
    </div>
  );
}
