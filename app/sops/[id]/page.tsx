import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { isAtLeast } from "@/lib/auth/roleRankShared";
import { getSop, canViewSop } from "@/lib/services/sops";
import { SopFileList } from "@/components/sops/SopFileList";
import type { AppRole } from "@/app/generated/prisma/client";

const ROLE_LABELS: Record<AppRole, string> = {
  TECHNICIAN: "Technician",
  SERVICE_MANAGER: "Service Manager",
  CEO: "CEO",
  SDR: "SDR",
};

// notFound() (not /not-authorized) for a SOP the viewer's role can't
// see — same reasoning a 404 beats a 403 for content whose existence
// itself might be sensitive: a technician hitting an arbitrary /sops/id
// URL shouldn't be able to tell "this doesn't exist" apart from
// "this exists but isn't for you."
export default async function SopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSignedIn();
  const { id } = await params;
  const role = session.role as AppRole;

  const sop = await getSop(id);
  if (!sop || !canViewSop(sop, role)) notFound();

  const canManage = isAtLeast(role, "SERVICE_MANAGER");

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link href="/sops" className="font-data text-xs text-text-faint hover:text-text">
        ← SOPs
      </Link>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">{sop.title}</h1>
          {sop.taskArea && <p className="mt-1 text-sm text-text-muted">{sop.taskArea}</p>}
        </div>
        {canManage && (
          <Link href={`/sops/${sop.id}/edit`} className="shrink-0 font-data text-xs text-accent hover:underline">
            Edit
          </Link>
        )}
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm text-text">{sop.body}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {sop.roles.map((r) => (
          <span
            key={r}
            className="rounded border border-border-strong px-1.5 py-0.5 font-data text-[10px] tracking-wide text-text-faint uppercase"
          >
            {ROLE_LABELS[r]}
          </span>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-medium text-text-muted">Files</h2>
        <div className="mt-2">
          <SopFileList sopId={sop.id} files={sop.files} />
        </div>
      </div>
    </div>
  );
}
