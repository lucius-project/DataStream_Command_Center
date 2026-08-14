import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/staffSession";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PendingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role) redirect("/"); // already assigned — nothing pending

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-panel p-6 text-center">
        <h1 className="font-display text-lg font-semibold text-text">Access pending</h1>
        <p className="mt-2 text-sm text-text-muted">
          You&apos;re signed in as <span className="text-text">{session.email}</span>, but no role has been
          assigned to your account yet. Ask your CEO or service manager to assign one from Admin Settings →
          Users.
        </p>
        <div className="mt-5 flex justify-center">
          <SignOutButton label="Sign out" />
        </div>
      </div>
    </div>
  );
}
