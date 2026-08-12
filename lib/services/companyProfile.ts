import { prisma } from "@/lib/prisma";

export async function getClientProfile(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      agreementItems: true,
      techHours: { orderBy: { hours: "desc" } },
      monthlyHours: { orderBy: { yearMonth: "desc" }, take: 12 },
      financials: true,
      seatChecks: true,
    },
  });
}

export async function linkClientAccounts(
  id: string,
  input: { ninjaOrganizationId?: string | null; quickbooksCustomerId?: string | null },
): Promise<void> {
  await prisma.client.update({
    where: { id },
    data: {
      ninjaOrganizationId: input.ninjaOrganizationId ?? undefined,
      quickbooksCustomerId: input.quickbooksCustomerId ?? undefined,
    },
  });
}
