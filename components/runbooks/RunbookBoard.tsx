import { RunbookRow } from "./RunbookRow";
import { AddRunbookItemForm } from "./AddRunbookItemForm";
import type { RunbookBoardCategory } from "@/lib/services/runbooks";

export function RunbookBoard({ categories }: { categories: RunbookBoardCategory[] }) {
  return (
    <div className="flex flex-col gap-6">
      {categories.map((cat) => (
        <div key={cat.id}>
          <h2 className="mb-2 font-display text-sm font-medium text-text-muted">{cat.name}</h2>
          <div className="flex flex-col gap-2">
            {cat.items.map((item) => (
              <RunbookRow key={item.id} item={item} />
            ))}
            {cat.items.length === 0 && (
              <div className="rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
                No items yet.
              </div>
            )}
          </div>
        </div>
      ))}

      <AddRunbookItemForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
