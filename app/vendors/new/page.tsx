import Link from "next/link";
import { requireRole } from "@/lib/auth/roleRank";
import { VendorSubscriptionForm } from "@/components/vendors/VendorSubscriptionForm";

export default async function NewVendorSubscriptionPage() {
  await requireRole("CEO");

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link href="/vendors" className="font-data text-xs text-text-faint hover:text-text">
        ← Vendor Subscriptions
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-text">New Vendor Subscription</h1>

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <VendorSubscriptionForm initial={{ vendorName: "", productName: "", renewalDate: "", notes: "" }} />
      </div>
    </div>
  );
}
