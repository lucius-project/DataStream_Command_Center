import Link from "next/link";
import { requireRole } from "@/lib/auth/roleRank";
import { getStaffUsers } from "@/lib/services/staffUsers";
import { KNOWN_TECHS } from "@/lib/integrations/halopsa";
import { StaffUsersForm } from "@/components/admin/StaffUsersForm";

export default async function AdminUsersPage() {
  await requireRole("CEO");
  const users = await getStaffUsers();

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <Link href="/admin" className="font-data text-xs text-text-faint hover:text-text">
        ← Admin Settings
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-text">Users</h1>
      <p className="mt-1 text-sm text-text-muted">
        Everyone who has signed in with Microsoft 365. A new sign-in has no access until assigned a role here —
        the very first person to ever sign in became CEO automatically.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <StaffUsersForm
          rows={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, techPerson: u.techPerson }))}
          knownTechs={KNOWN_TECHS}
        />
      </div>
    </div>
  );
}
