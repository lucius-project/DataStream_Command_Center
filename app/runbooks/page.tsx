import { getRunbookBoard } from "@/lib/services/runbooks";
import { RunbookBoard } from "@/components/runbooks/RunbookBoard";

export default async function RunbooksPage() {
  const categories = await getRunbookBoard();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Runbooks</h1>
      <p className="mt-1 text-sm text-text-muted">
        Checklists for the roles you run yourself — Marketing, Sales, Account Management,
        Billing, Vendor Relationships.
      </p>
      <div className="mt-6">
        <RunbookBoard categories={categories} />
      </div>
    </div>
  );
}
