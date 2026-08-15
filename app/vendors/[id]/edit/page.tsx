import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roleRank";
import { getVendorSubscription } from "@/lib/services/vendorSubscriptions";
import { VendorSubscriptionForm } from "@/components/vendors/VendorSubscriptionForm";

export default async function EditVendorSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("CEO");
  const { id } = await params;
  const sub = await getVendorSubscription(id);
  if (!sub) notFound();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link href="/vendors" className="font-data text-xs text-text-faint hover:text-text">
        ← Vendor Subscriptions
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-text">Edit Vendor Subscription</h1>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <VendorSubscriptionForm
          initial={{
            id: sub.id,
            vendorName: sub.vendorName,
            productName: sub.productName,
            renewalDate: sub.renewalDate.toISOString().slice(0, 10),
            notes: sub.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
