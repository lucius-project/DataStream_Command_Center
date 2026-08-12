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

// Business days elapsed this week (Mon-Fri), today counted as a full day —
// keeps an hours-utilization denominator from reading as a false "red"
// every Monday morning. Weekends clamp to the full 5-day week. Shared by
// Business Health's Tech Utilization KPI and Tech Performance's org
// summary, so "utilization this week" means the same percentage on both
// pages rather than two pages quietly disagreeing.
export function weekFractionElapsed(): number {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const businessDay = day === 0 ? 5 : day === 6 ? 5 : day; // Mon=1..Fri=5, weekend=5
  return businessDay / 5;
}

// 0-4 (Mon-Fri) index of today within the business week — weekends clamp
// to 4 (Friday), same "week already complete" treatment as
// weekFractionElapsed. Used to tell a daily hours chart which days are
// "already happened, judge them" versus "hasn't happened yet, don't
// flag it as a shortfall."
export function todayWeekdayIndex(): number {
  const day = new Date().getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  if (day === 0 || day === 6) return 4;
  return day - 1;
}
