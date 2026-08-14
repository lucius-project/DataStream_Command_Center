import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/staffSession";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Already signed in with a role — nothing to do here.
  const session = await getSession();
  if (session?.role) redirect("/");
  if (session) redirect("/pending");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-panel p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-full bg-status-ok" />
        </div>
        <h1 className="mt-3 font-display text-lg font-semibold text-text">DataStream Command Center</h1>
        <p className="mt-1 text-sm text-text-muted">Sign in with your Microsoft 365 account to continue.</p>

        {error && (
          <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-3 py-2 text-left text-xs text-status-critical">
            {error}
          </div>
        )}

        <a
          href="/api/auth/staff/login"
          className="mt-5 flex min-h-11 w-full items-center justify-center rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong"
        >
          Sign in with Microsoft 365
        </a>
      </div>
    </div>
  );
}
