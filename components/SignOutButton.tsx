"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function SignOutButton({ label }: { label?: string }) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/staff/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (label) {
    return (
      <button
        type="button"
        onClick={signOut}
        className="flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-accent hover:text-text"
      >
        <LogOut size={14} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      className="flex h-8 w-8 items-center justify-center rounded-md text-text-faint hover:bg-panel-raised hover:text-text"
    >
      <LogOut size={15} />
    </button>
  );
}
