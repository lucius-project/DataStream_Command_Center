import type { InboxCategory, InboxUrgency } from "@/app/generated/prisma/client";

// Display-only mappings shared by every inbox card variant — kept in
// one place so the category/urgency vocabulary can't drift between the
// header count strip, Morning Brief, Today's Actions, and the board.

export const CATEGORY_LABELS: Record<InboxCategory, string> = {
  CLIENT: "Client",
  APPROVAL: "Approval",
  INTERNAL: "Internal",
  SALES: "Sales",
  OTHER: "Other",
};

export const URGENCY_META: Record<InboxUrgency, { label: string; dot: string; text: string }> = {
  ATTENTION_TODAY: { label: "Needs attention today", dot: "bg-status-critical", text: "text-status-critical" },
  DECISION: { label: "Needs a decision", dot: "bg-status-warn", text: "text-status-warn" },
  DELEGATABLE: { label: "Can be delegated", dot: "bg-status-info", text: "text-status-info" },
  INFORMATIONAL: { label: "Informational", dot: "bg-status-ok", text: "text-status-ok" },
  NEWSLETTER: { label: "Newsletter / low priority", dot: "bg-text-faint", text: "text-text-faint" },
};

export function formatAge(receivedAt: Date): string {
  const hours = Math.floor((Date.now() - receivedAt.getTime()) / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} old`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} old`;
}

export function formatWaiting(waitingSince: Date | null): string {
  if (!waitingSince) return "";
  const days = Math.floor((Date.now() - waitingSince.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return "Waiting since today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

export function formatDueDate(dueDate: Date | null): string | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Due: Today";
  if (diffDays < 0) return `Due: ${Math.abs(diffDays)}d overdue`;
  return `Due: ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function formatDollarAmount(amount: number | null): string | null {
  if (amount === null) return null;
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
