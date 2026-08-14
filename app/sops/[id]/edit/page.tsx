import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roleRank";
import { getSop } from "@/lib/services/sops";
import { SopForm } from "@/components/sops/SopForm";

export default async function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("SERVICE_MANAGER");
  const { id } = await params;
  const sop = await getSop(id);
  if (!sop) notFound();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link href="/sops" className="font-data text-xs text-text-faint hover:text-text">
        ← SOPs
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-text">Edit SOP</h1>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <SopForm
          initial={{
            id: sop.id,
            title: sop.title,
            body: sop.body,
            taskArea: sop.taskArea ?? "",
            roles: sop.roles,
            existingFiles: sop.files.map((f) => ({ id: f.id, fileName: f.fileName })),
          }}
        />
      </div>
    </div>
  );
}
