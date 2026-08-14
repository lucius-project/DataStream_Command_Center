import { prisma } from "@/lib/prisma";
import type { AppRole, StaffUser } from "@/app/generated/prisma/client";

// CEO-only user/role management (see app/admin/users/page.tsx) — the
// only place a newly-signed-in StaffUser (role: null, see
// app/api/auth/staff/callback/route.ts) actually gets access.
export async function getStaffUsers(): Promise<StaffUser[]> {
  return prisma.staffUser.findMany({ orderBy: { createdAt: "asc" } });
}

export async function updateStaffUsers(
  entries: { id: string; role: AppRole | null; techPerson: string | null }[],
): Promise<void> {
  await Promise.all(
    entries.map((e) =>
      prisma.staffUser.update({
        where: { id: e.id },
        data: { role: e.role, techPerson: e.role === "TECHNICIAN" ? e.techPerson : null },
      }),
    ),
  );
}
