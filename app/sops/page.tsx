import Link from "next/link";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { isAtLeast } from "@/lib/auth/roleRankShared";
import { getSopsForRole, type SopEntryWithRoles } from "@/lib/services/sops";
import type { AppRole } from "@/app/generated/prisma/client";

const UNGROUPED_LABEL = "General";

const ROLE_LABELS: Record<AppRole, string> = {
  TECHNICIAN: "Technician",
  SERVICE_MANAGER: "Service Manager",
  CEO: "CEO",
  SDR: "SDR",
};

function groupByTaskArea(sops: SopEntryWithRoles[]): [string, SopEntryWithRoles[]][] {
  const groups = new Map<string, SopEntryWithRoles[]>();
  for (const sop of sops) {
    const key = sop.taskArea || UNGROUPED_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sop);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function excerpt(body: string, maxLength = 160): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength).trimEnd()}…` : oneLine;
}

// Visible to every signed-in, role-assigned user (requireSignedIn, no
// rank requirement) — CEO sees every entry (same "sees everything" rule
// as the rest of this app), everyone else only what's tagged for their
// own role (see getSopsForRole). Each card links to /sops/[id] for the
// full description and file list — Edit lives there too, not here.
// Authoring is a separate concern: the "+ New SOP" link below is UX
// only (hidden for roles that can't manage), the real boundary is
// requireRole("SERVICE_MANAGER") on /sops/new, /sops/[id]/edit, and the
// underlying API routes.
export default async function SopsPage() {
  const session = await requireSignedIn();
  // requireSignedIn already guarantees role is non-null (redirects to
  // /pending otherwise) — the cast just reflects that at the type level.
  const role = session.role as AppRole;
  const sops = await getSopsForRole(role);
  const canManage = isAtLeast(role, "SERVICE_MANAGER");
  const groups = groupByTaskArea(sops);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">SOPs</h1>
          <p className="mt-1 text-sm text-text-muted">
            {role === "CEO" ? "Every SOP, across every role." : "SOPs that apply to your role."}
          </p>
        </div>
        {canManage && (
          <Link
            href="/sops/new"
            className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong"
          >
            + New SOP
          </Link>
        )}
      </div>

      {sops.length === 0 ? (
        <div className="mt-6 rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          No SOPs apply to your role yet.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map(([area, items]) => (
            <section key={area}>
              <h2 className="font-display text-sm font-medium text-text-muted">{area}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {items.map((sop) => (
                  <Link
                    key={sop.id}
                    href={`/sops/${sop.id}`}
                    className="rounded-lg border border-border bg-panel p-4 hover:border-accent"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold text-text">{sop.title}</h3>
                      {sop.files.length > 0 && (
                        <span className="shrink-0 font-data text-[11px] text-text-faint">
                          {sop.files.length} file{sop.files.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-text-muted">{excerpt(sop.body)}</p>
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
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
