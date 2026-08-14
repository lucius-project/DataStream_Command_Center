import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/staffSession";

export default async function NotAuthorizedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.role) redirect("/pending");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-panel p-6 text-center">
        <h1 className="font-display text-lg font-semibold text-text">Not authorized</h1>
        <p className="mt-2 text-sm text-text-muted">
          Your role ({session.role}) doesn&apos;t have access to that page.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-10 items-center rounded-md border border-border-strong px-4 text-sm text-text-muted hover:border-accent hover:text-text"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
