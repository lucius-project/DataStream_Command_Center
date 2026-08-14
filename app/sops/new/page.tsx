import Link from "next/link";
import { requireRole } from "@/lib/auth/roleRank";
import { SopForm } from "@/components/sops/SopForm";

export default async function NewSopPage() {
  await requireRole("SERVICE_MANAGER");

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link href="/sops" className="font-data text-xs text-text-faint hover:text-text">
        ← SOPs
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-text">New SOP</h1>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <SopForm initial={{ title: "", body: "", taskArea: "", roles: [] }} />
      </div>
    </div>
  );
}
