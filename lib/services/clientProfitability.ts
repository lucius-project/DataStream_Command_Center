import { prisma } from "@/lib/prisma";

export async function getClientProfitabilityReport() {
  return prisma.client.findMany({
    include: {
      agreementItems: true,
      techHours: { orderBy: { hours: "desc" } },
      // Most recent 12 months present in the ledger — on instances where
      // the HaloPSA backfill can only reach back a few weeks (see
      // fetchHaloTicketHistory's 1000-row cap), this may be fewer than 12.
      monthlyHours: { orderBy: { yearMonth: "desc" }, take: 12 },
    },
    orderBy: { hoursThisMonth: "desc" },
  });
}

export type RollingAverage = {
  avgHoursPerMonth: number;
  monthsCovered: number;
  earliestMonth: string | null;
  latestMonth: string | null;
};

// Average is always total ÷ months actually present in the ledger, never
// ÷ 12 — so it stays honest about a short backfill window instead of
// silently understating the average. earliest/latestMonth ("YYYY-MM") let
// the UI label the window instead of implying a full year was measured.
export function rollingAverageHours(monthlyHours: { yearMonth: string; hours: number }[]): RollingAverage {
  if (monthlyHours.length === 0) {
    return { avgHoursPerMonth: 0, monthsCovered: 0, earliestMonth: null, latestMonth: null };
  }
  const total = monthlyHours.reduce((sum, m) => sum + m.hours, 0);
  const sorted = [...monthlyHours].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  return {
    avgHoursPerMonth: Math.round((total / monthlyHours.length) * 10) / 10,
    monthsCovered: monthlyHours.length,
    earliestMonth: sorted[0].yearMonth,
    latestMonth: sorted[sorted.length - 1].yearMonth,
  };
}
