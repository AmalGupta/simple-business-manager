import { fmtShort } from "../../lib/dates.js";
import { parseSqliteUtc } from "./workDates.js";

/* Task audit wording, shared by the Task audit dashboards and the per-task
   timeline. */
const dateOrNone = (v) => (v ? fmtShort(v) : "none");

/* The state change as the admin reads it. */
export function describeTransition(e) {
  switch (e.event) {
    case "assigned":
      if (e.from_user_name) return "Reassigned";
      return e.actor_role === "admin" || e.actor_role === "superadmin" ? "Admin → Routed" : "Assigned";
    case "handed_off":
      return "Open → Passed";
    case "completed":
      return e.item_kind === "complaint" ? "Open → Resolved" : "Open → Done";
    case "reopened":
      return "Done → Open";
    case "parked":
      return "Open → Parked";
    case "unparked":
      return "Parked → Open";
    case "rerouted":
      return "Staff → Back to owner for routing";
    case "offboard_rerouted":
      return "Staff left → Back to owner for routing";
    case "marked_urgent":
      return "Marked urgent";
    case "urgent_cleared":
      return "Urgent cleared";
    case "marked_important":
      return "Marked important";
    case "important_cleared":
      return "Important cleared";
    case "location_changed":
      return `Moved: ${e.from_value === "factory" ? "Factory" : "Office"} → ${e.to_value === "factory" ? "Factory" : "Office"}`;
    case "due_changed":
      return `Change due date: ${dateOrNone(e.from_value)} → ${dateOrNone(e.to_value)}`;
    case "scheduled":
      if (!e.to_value) return `Plan date cleared (was ${fmtShort(e.from_value)})`;
      return e.from_value
        ? `Change plan date: ${fmtShort(e.from_value)} → ${fmtShort(e.to_value)}`
        : `Planned for ${fmtShort(e.to_value)}`;
    default:
      return e.event;
  }
}

/* Whose task it is after the transition. */
export function assignedToName(e) {
  if (e.event === "assigned" || e.event === "handed_off" || e.event === "rerouted" || e.event === "offboard_rerouted") {
    return e.to_user_name ?? "NA";
  }
  return e.subject_name ?? "NA";
}

/** yyyy-mm-dd of an audit row in IST (for "grouped by date"). */
export function auditDayKey(e) {
  const d = parseSqliteUtc(e.created_at);
  if (!d) return "";
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

/** Which recording a call todo came from, for the task link's hint. */
export function callKindLabel(e) {
  if (e.call_kind === "desk") return "Desk conversation";
  if (e.call_kind === "site_memo") return "Site voice note";
  if (e.call_kind === "call") return e.client_name ? `Call · ${e.client_name}` : "Call";
  return e.item_kind === "site_task" ? "Site task" : "";
}
