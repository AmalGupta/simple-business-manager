import { dayKey } from "./dates.js";

/**
 * Filter/sort metadata attached to each call for the Calls dashboard grid.
 * Keeps filter predicates out of JSX and ag-Grid column defs.
 */
export function buildCallMetadata(call) {
  const callDateIso = call.recording_date || call.recorded_at || null;
  const todos = Array.isArray(call.todos) ? call.todos : [];
  return {
    callDateIso,
    callDateKey: dayKey(callDateIso),
    caller: call.client_name || "Unknown caller",
    isImportant: call.call_type !== "low_signal",
    hasTodos: todos.length > 0,
    openTodoCount: todos.filter((td) => td.status !== "done").length,
  };
}

export function withCallMetadata(call) {
  return { ...call, meta: buildCallMetadata(call) };
}

export function uniqueCallers(callsWithMeta) {
  const set = new Set();
  for (const c of callsWithMeta) {
    if (c.meta?.caller) set.add(c.meta.caller);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * @param {object[]} rows - calls with `.meta`
 * @param {{ dateFrom?: string|null, dateTo?: string|null, callers?: string[], importantOnly?: boolean, withTodosOnly?: boolean }} filters
 */
export function filterCallsByMeta(rows, filters) {
  const callerSet =
    filters.callers && filters.callers.length > 0 ? new Set(filters.callers) : null;
  return rows.filter((row) => {
    const m = row.meta;
    if (!m) return false;
    if (filters.dateFrom && (!m.callDateKey || m.callDateKey < filters.dateFrom)) return false;
    if (filters.dateTo && (!m.callDateKey || m.callDateKey > filters.dateTo)) return false;
    if (callerSet && !callerSet.has(m.caller)) return false;
    if (filters.importantOnly && !m.isImportant) return false;
    if (filters.withTodosOnly && !m.hasTodos) return false;
    return true;
  });
}
