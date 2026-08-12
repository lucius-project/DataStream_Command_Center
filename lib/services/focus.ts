import { prisma } from "@/lib/prisma";

export async function getRecentSessions(limit = 10) {
  return prisma.focusSession.findMany({
    where: { endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function startSession(task: string) {
  return prisma.focusSession.create({ data: { task } });
}

export async function endSession(id: string, completed: boolean) {
  const session = await prisma.focusSession.findUnique({ where: { id } });
  if (!session) throw new Error("Focus session not found.");
  const endedAt = new Date();
  const durationSeconds = Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000);
  return prisma.focusSession.update({
    where: { id },
    data: { endedAt, durationSeconds, completed },
  });
}
