// TechRole display labels — deliberately its own dependency-free module
// (same "safe to import from a client component" precedent as
// lib/kpiStatus.ts/lib/dateUtils.ts), not defined in
// lib/services/techPerformanceScore.ts. That file transitively imports
// lib/prisma.ts (better-sqlite3, a Node-only native binding) — importing
// any *value* from it into a "use client" component (e.g.
// components/admin/TechRolesForm.tsx) pulls that whole chain into the
// browser bundle and breaks (confirmed live: `next build` fails with
// "Module not found: Can't resolve 'fs'"). TechRole itself (the type) is
// still safe to import anywhere — types are erased at compile time —
// this module only needs to exist for the one real *value*.

import type { TechRole } from "@/app/generated/prisma/client";

export type { TechRole };

export const TECH_ROLE_LABELS: Record<TechRole, string> = {
  SERVICE_DESK_TECHNICIAN: "Service Desk Technician",
  SENIOR_TECHNICIAN: "Senior Technician",
  ESCALATION_ENGINEER: "Escalation Engineer",
  PROJECT_ENGINEER: "Project Engineer",
  SERVICE_DESK_MANAGER: "Service Desk Manager",
  HYBRID: "Hybrid",
};
