import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Inbox,
  Radar,
  ListChecks,
  Timer,
  BookOpen,
  Users,
  Megaphone,
  LayoutDashboard,
  HeartPulse,
  Plug,
  BarChart3,
  Gauge,
  PhoneCall,
  MonitorCheck,
  Settings,
  FileText,
} from "lucide-react";

import type { RankedRole } from "@/lib/auth/roleRankShared";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  status: "active" | "soon";
  group: "Daily" | "Runbooks" | "Growth" | "Personal" | "System";
  // Undefined = visible to every signed-in, role-assigned user (incl.
  // SDR, which has no rank of its own — see lib/auth/roleRank.ts).
  // Real access control lives in each page's own requireRole() call;
  // this only decides whether the nav even shows a link, so a
  // technician isn't looking at a link that just redirects them away.
  minRole?: RankedRole;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/business-health", label: "Business Health", icon: Activity, status: "active", group: "Daily", minRole: "SERVICE_MANAGER" },
  { href: "/inbox", label: "Inbox Command", icon: Inbox, status: "active", group: "Daily", minRole: "SERVICE_MANAGER" },
  { href: "/operations", label: "Operations", icon: Radar, status: "active", group: "Daily", minRole: "SERVICE_MANAGER" },
  { href: "/calls", label: "Call Activity", icon: PhoneCall, status: "active", group: "Daily", minRole: "SERVICE_MANAGER" },
  { href: "/command-flow", label: "Command Flow", icon: ListChecks, status: "active", group: "Daily", minRole: "SERVICE_MANAGER" },
  { href: "/focus", label: "Focus Mode", icon: Timer, status: "active", group: "Daily" },
  { href: "/runbooks", label: "Runbooks", icon: BookOpen, status: "active", group: "Runbooks", minRole: "SERVICE_MANAGER" },
  { href: "/sops", label: "SOPs", icon: FileText, status: "active", group: "Runbooks" },
  { href: "/clients", label: "Client Profitability", icon: BarChart3, status: "active", group: "Growth", minRole: "CEO" },
  { href: "/tech-performance", label: "Tech Performance", icon: Gauge, status: "active", group: "Growth" },
  { href: "/devices", label: "Device Health", icon: MonitorCheck, status: "active", group: "Growth", minRole: "SERVICE_MANAGER" },
  { href: "/crm", label: "CRM", icon: Users, status: "soon", group: "Growth" },
  { href: "/marketing", label: "Marketing Automation", icon: Megaphone, status: "soon", group: "Growth" },
  { href: "/dashboards", label: "Department Dashboards", icon: LayoutDashboard, status: "soon", group: "Growth" },
  { href: "/mindset", label: "Mindset & Fitness", icon: HeartPulse, status: "soon", group: "Personal" },
  { href: "/integrations", label: "Integrations", icon: Plug, status: "active", group: "System", minRole: "CEO" },
  { href: "/admin", label: "Admin Settings", icon: Settings, status: "active", group: "System", minRole: "CEO" },
];

export const NAV_GROUPS: NavItem["group"][] = ["Daily", "Runbooks", "Growth", "Personal", "System"];
