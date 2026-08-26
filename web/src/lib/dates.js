/* ------------------------------------------------------------------
   Dates. Everything is an ISO yyyy-mm-dd string, matching D1.
   ------------------------------------------------------------------ */
export const DAY = 86400000;
export const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
export const dayKey = (iso) => (iso ? String(iso).slice(0, 10) : null);
/* Local Y/M/D -> "yyyy-mm-dd" without a toISOString() round trip — that
   round trip goes through UTC and silently shifts the date by a day in
   any timezone that isn't UTC itself (bit us for the calendar grid). */
export const isoDate = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export const daysUntil = (iso) => (iso ? Math.round((new Date(iso) - today()) / DAY) : null);
export const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    : "";
export const fmtShort = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
export const fmtLong = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

/* Urgency is the ONLY thing allowed to produce colour. */
export const isUrgent = (todo) => {
  if (todo.status !== "open" || !todo.due_date) return false;
  const d = daysUntil(todo.due_date);
  return d !== null && d <= 1;
};

/* Same urgency rule, applied to a site task's due_date rather than a todo's. */
export const isTaskDueDateUrgent = (dueDate) => {
  if (!dueDate) return false;
  const d = daysUntil(dueDate);
  return d !== null && d <= 1;
};
