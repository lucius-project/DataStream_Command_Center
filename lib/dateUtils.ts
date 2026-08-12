// Shared business-week boundaries (Monday–Friday) — used anywhere "this
// week" needs to mean the same thing: the seed script, and the live
// Team Time Gaps sync, so a synced row always lines up with what a fresh
// seed would have produced for the same week.

export function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function endOfWeek(): Date {
  const start = startOfWeek();
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  end.setHours(23, 59, 59, 999);
  return end;
}
