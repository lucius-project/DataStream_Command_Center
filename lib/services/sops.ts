import { prisma } from "@/lib/prisma";
import { deleteAllFilesForSop } from "./sopFiles";
import type { AppRole, SopEntry, SopFile } from "@/app/generated/prisma/client";

export type SopInput = {
  title: string;
  body: string;
  taskArea: string | null;
  roles: AppRole[];
};

export type SopEntryWithRoles = Omit<SopEntry, "roles"> & { roles: AppRole[]; files: SopFile[] };

function serializeRoles(roles: AppRole[]): string {
  return roles.join(",");
}

function parseRoles(raw: string): AppRole[] {
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean) as AppRole[];
}

function withParsedRoles(entry: SopEntry & { files: SopFile[] }): SopEntryWithRoles {
  return { ...entry, roles: parseRoles(entry.roles) };
}

// Unfiltered — the authoring view (SERVICE_MANAGER+, see app/sops/page.tsx's
// Manage link) needs to see and edit every entry regardless of who it's
// tagged for.
export async function getAllSops(): Promise<SopEntryWithRoles[]> {
  const rows = await prisma.sopEntry.findMany({
    orderBy: [{ taskArea: "asc" }, { title: "asc" }],
    include: { files: { orderBy: { createdAt: "asc" } } },
  });
  return rows.map(withParsedRoles);
}

// CEO sees every SOP, same "sees everything" rule as the rest of this
// app; everyone else only sees entries tagged for their own role.
export async function getSopsForRole(role: AppRole): Promise<SopEntryWithRoles[]> {
  const all = await getAllSops();
  if (role === "CEO") return all;
  return all.filter((s) => s.roles.includes(role));
}

export async function getSop(id: string): Promise<SopEntryWithRoles | null> {
  const row = await prisma.sopEntry.findUnique({
    where: { id },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });
  return row ? withParsedRoles(row) : null;
}

// A viewer can open this entry's detail page/files if they're CEO or
// their role is one of the entry's tagged roles — same rule
// getSopsForRole filters the list by, checked again here since the
// detail page and file-serving route are separate entry points a
// direct URL/id could hit without going through the filtered list.
export function canViewSop(entry: Pick<SopEntryWithRoles, "roles">, role: AppRole): boolean {
  return role === "CEO" || entry.roles.includes(role);
}

export async function createSop(input: SopInput): Promise<SopEntry> {
  return prisma.sopEntry.create({
    data: { title: input.title, body: input.body, taskArea: input.taskArea, roles: serializeRoles(input.roles) },
  });
}

export async function updateSop(id: string, input: SopInput): Promise<void> {
  await prisma.sopEntry.update({
    where: { id },
    data: { title: input.title, body: input.body, taskArea: input.taskArea, roles: serializeRoles(input.roles) },
  });
}

export async function deleteSop(id: string): Promise<void> {
  // Files on disk first — the DB row (and its SopFile rows, via
  // onDelete: Cascade) go second, so a failed disk cleanup never leaves
  // an orphaned SopEntry with no way to find its files again.
  await deleteAllFilesForSop(id);
  await prisma.sopEntry.delete({ where: { id } });
}
