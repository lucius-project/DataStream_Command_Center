import { requireSignedIn } from "@/lib/auth/roleRank";
import { AvatarUploadForm } from "@/components/account/AvatarUploadForm";

const ROLE_LABELS: Record<string, string> = {
  TECHNICIAN: "Technician",
  SERVICE_MANAGER: "Service Manager",
  CEO: "CEO",
  SDR: "SDR",
};

// Name/email/role are read-only here — they come from Microsoft SSO
// (name/email re-synced on every login) and /admin/users (role), not
// something the account owner edits directly. The picture is the one
// thing this page actually lets you change.
export default async function AccountPage() {
  const session = await requireSignedIn();

  return (
    <div className="mx-auto max-w-xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Account Settings</h1>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <AvatarUploadForm userId={session.id} name={session.name} hasAvatar={Boolean(session.avatarPath)} />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <div>
          <div className="font-data text-[10px] font-semibold tracking-wide text-text-faint uppercase">Name</div>
          <div className="mt-0.5 text-sm text-text">{session.name}</div>
        </div>
        <div>
          <div className="font-data text-[10px] font-semibold tracking-wide text-text-faint uppercase">Email</div>
          <div className="mt-0.5 text-sm text-text">{session.email}</div>
        </div>
        <div>
          <div className="font-data text-[10px] font-semibold tracking-wide text-text-faint uppercase">Role</div>
          <div className="mt-0.5 text-sm text-text">
            {session.role ? (ROLE_LABELS[session.role] ?? session.role) : "Pending assignment"}
          </div>
        </div>
      </div>
    </div>
  );
}
