import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getInboxTrend } from "@/lib/services/inbox";
import { TrendChart } from "@/components/inbox/TrendChart";

export default async function InboxTrendsPage() {
  const trend = await getInboxTrend(14);
  const last7 = trend.slice(-7);
  const incoming7 = last7.reduce((sum, d) => sum + d.incoming, 0);
  const cleared7 = last7.reduce((sum, d) => sum + d.cleared, 0);
  const net = cleared7 - incoming7;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link
        href="/inbox"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft size={16} />
        Back to Inbox Command
      </Link>
      <h1 className="mt-3 font-display text-2xl font-semibold text-text">Inbox trend</h1>
      <p className="mt-1 text-sm text-text-muted">
        Incoming vs. cleared, last 14 days — are you getting ahead of it?
      </p>

      <div className="mt-4 rounded-lg border border-border bg-panel p-4">
        <div className="font-data text-xs text-text-faint">Last 7 days</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`font-display text-2xl font-semibold ${
              net >= 0 ? "text-status-ok" : "text-status-critical"
            }`}
          >
            {net >= 0 ? "+" : ""}
            {net}
          </span>
          <span className="text-sm text-text-muted">net cleared vs. incoming</span>
        </div>
        <div className="mt-1 font-data text-xs text-text-faint">
          {incoming7} incoming · {cleared7} cleared
        </div>
      </div>

      <div className="mt-4">
        <TrendChart data={trend} />
      </div>
    </div>
  );
}
