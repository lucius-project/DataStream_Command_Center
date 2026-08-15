import { prisma } from "@/lib/prisma";
import type { VendorSubscription } from "@/app/generated/prisma/client";

export type VendorSubscriptionInput = {
  vendorName: string;
  productName: string;
  renewalDate: Date;
  notes: string | null;
};

export async function getVendorSubscriptions(): Promise<VendorSubscription[]> {
  return prisma.vendorSubscription.findMany({ orderBy: { renewalDate: "asc" } });
}

export async function getVendorSubscription(id: string): Promise<VendorSubscription | null> {
  return prisma.vendorSubscription.findUnique({ where: { id } });
}

export async function createVendorSubscription(input: VendorSubscriptionInput): Promise<void> {
  await prisma.vendorSubscription.create({ data: input });
}

export async function updateVendorSubscription(id: string, input: VendorSubscriptionInput): Promise<void> {
  await prisma.vendorSubscription.update({ where: { id }, data: input });
}

export async function deleteVendorSubscription(id: string): Promise<void> {
  await prisma.vendorSubscription.delete({ where: { id } });
}

// Whole-number days until renewalDate — negative if already past (an
// auto-renewed or lapsed subscription whose date wasn't updated yet).
export function daysUntil(renewalDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((renewalDate.getTime() - Date.now()) / msPerDay);
}

// 60 days — a fixed default rather than an admin-configurable KpiSettings
// field for this first version; these renewals mostly auto-renew (per
// Huntress's own notice: "no action needed to continue service"), so
// this is a budget-awareness window, not an urgent-response SLA the way
// KpiSettings' other thresholds are.
export const RENEWAL_SOON_DAYS = 60;
