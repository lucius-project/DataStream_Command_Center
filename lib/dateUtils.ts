// Shared business-week boundaries (Monday–Friday) — used anywhere "this
// week" needs to mean the same thing: the seed script, and the live
// Team Time Gaps sync, so a synced row always lines up with what a fresh
// seed would have produced for the same week.

// Midnight-normalized today — shared by anything upserting a "one row
// per calendar day" table (ServiceDeskHealthDaily, TechScoreDaily), so
// the same instant is used as the unique key wherever "today" means a
// calendar day, not a moving 24h window.
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

// 0-4 (Mon-Fri) index of a date within its business week — weekends clamp
// to 4 (Friday), same "week already complete" treatment as
// weekFractionElapsed. Generalizes todayWeekdayIndex (below) to any date,
// for bucketing e.g. calls/remote sessions by day alongside DailyHours'
// own Mon-Fri row ordering (see activityCorrelation.ts's Customer
// Interaction Time).
export function weekdayIndexOf(date: Date): number {
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  if (day === 0 || day === 6) return 4;
  return day - 1;
}

// 0-4 (Mon-Fri) index of today within the business week. Used to tell a
// daily hours chart which days are "already happened, judge them" versus
// "hasn't happened yet, don't flag it as a shortfall."
export function todayWeekdayIndex(): number {
  return weekdayIndexOf(new Date());
}

// Mon-Fri, 8:30am-5:00pm — used to exclude after-hours calls from every
// call-performance calculation (answer rate, pickup rate, ring/talk
// time, per-tech in/out counts). After-hours inbound calls route to
// voicemail rather than ringing a tech (confirmed operational fact, not
// a guess), so counting them as "missed" would penalize the team for
// calls nobody was ever meant to answer. Doesn't affect the raw call log
// itself (Call Activity still lists every synced call, business hours
// or not) — only the calculated stats built on top of it.
//
// Uses the server's local time via Date's getDay/getHours, same implicit
// "server TZ = business TZ" assumption startOfWeek/endOfWeek/
// weekFractionElapsed above already make — CDR timestamps are stored as
// real UTC instants (see unitedCloud.ts), so this only produces correct
// results if the server runs in the business's own timezone. Confirmed
// true in this deployment (America/Vancouver); revisit with an explicit
// Intl.DateTimeFormat timeZone conversion if that ever changes.
export function isBusinessHours(date: Date): boolean {
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  if (day === 0 || day === 6) return false;
  const minutesSinceMidnight = date.getHours() * 60 + date.getMinutes();
  return minutesSinceMidnight >= 8 * 60 + 30 && minutesSinceMidnight < 17 * 60;
}

const BUSINESS_DAY_START_MIN = 8 * 60 + 30; // 8:30am
const BUSINESS_DAY_END_MIN = 17 * 60; // 5:00pm

// Business hours (Mon-Fri, 8:30am-5:00pm) elapsed between two timestamps —
// the one shared engine for ticket aging/SLA math, same business-hours
// definition as isBusinessHours above (not a second, independently-tuned
// implementation). Without this, a ticket opened Friday at 4pm would read
// as "~65 hours old" by Monday morning wall-clock time, even though only
// ~30 business minutes have actually elapsed — exactly the false alarm
// this function exists to prevent. Walks day-by-day (not hour-by-hour)
// for correctness on multi-week spans without being slow, clamping each
// day's business window to the [start, end] interval and summing only
// the overlap; weekends contribute zero regardless of how much wall-clock
// time they span.
export function businessHoursElapsed(start: Date, end: Date): number {
  if (end <= start) return 0;

  let totalMinutes = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(end);
  lastDay.setHours(0, 0, 0, 0);

  while (cursor <= lastDay) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, BUSINESS_DAY_START_MIN, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(0, BUSINESS_DAY_END_MIN, 0, 0);
      const windowStart = start > dayStart ? start : dayStart;
      const windowEnd = end < dayEnd ? end : dayEnd;
      if (windowEnd > windowStart) {
        totalMinutes += (windowEnd.getTime() - windowStart.getTime()) / 60000;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMinutes / 60;
}
