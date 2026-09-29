/**
 * SBM-64 — staff transitions. Pure date rules shared by the API, the cron
 * finalizer and tests. All dates are yyyy-mm-dd in IST (istTodayIso).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Login is refused before the joining day. A missing date never blocks. */
export function hasJoined(joinedOn: string | null | undefined, today: string): boolean {
  return !joinedOn || joinedOn <= today;
}

/** The last working day itself is still a working day — finalize the day after. */
export function isOffboardingDue(lastWorkingDay: string | null | undefined, today: string): boolean {
  return Boolean(lastWorkingDay) && (lastWorkingDay as string) < today;
}

/** Whole days from today until the last working day (0 on the day itself, negative once past). */
export function daysUntil(date: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
