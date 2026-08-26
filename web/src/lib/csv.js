import { dayKey } from "./dates.js";

/* ------------------------------------------------------------------
   Report export. One row per todo, generated client-side.

   Two things that matter and are easy to get wrong:
   - Leading BOM, or Excel renders Devanagari as mojibake. Transcripts
     and todos are code-mixed, so this is not hypothetical.
   - Fields opening with = + - @ are escaped, or Excel treats them as
     formulas. A todo reading "-5mm undersized" is a live example.
   ------------------------------------------------------------------ */
export const CSV_COLUMNS = [
  "call_date",
  "client",
  "phone",
  "owner",
  "todo",
  "due_date",
  "status",
  "completed_on",
  "customer_waiting",
];

export function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildReportRows(calls) {
  const rows = [];
  for (const call of calls) {
    for (const todo of call.todos) {
      rows.push([
        dayKey(call.recorded_at),
        call.client_name,
        call.client_phone ?? "",
        todo.owner === "self" ? "him" : todo.owner,
        todo.text,
        todo.due_date ?? "",
        todo.status,
        dayKey(todo.completed_at) ?? "",
        call.customer_waiting ? "yes" : "no",
      ]);
    }
  }
  return rows;
}

export function downloadReport(calls, label) {
  const rows = buildReportRows(calls);
  const csv = [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sbm-${label}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
