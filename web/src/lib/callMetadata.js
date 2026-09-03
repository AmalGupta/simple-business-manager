import { dayKey } from "./dates.js";

/** @typedef {"voice_call" | "voice_note"} RecordingEntryType */

export const ENTRY_TYPE_LABEL = {
  voice_call: "Voice Call",
  voice_note: "Voice Note",
};

/**
 * Voice Note = site memo / complaint / measurement / checklist recording
 * (`recorded_for_site_id` set at upload). Everything else (Drive poll, phone
 * upload) is a Voice Call. Derived at read time — no migration.
 */
export function recordingEntryType(call) {
  return call?.recorded_for_site_id ? "voice_note" : "voice_call";
}

/**
 * Filter/sort metadata attached to each call for the Calls dashboard grid.
 * Keeps filter predicates out of JSX and ag-Grid column defs.
 */
export function buildCallMetadata(call) {
  const callDateIso = call.recording_date || call.recorded_at || null;
  const todos = Array.isArray(call.todos) ? call.todos : [];
  const entryType = recordingEntryType(call);
  return {
    callDateIso,
    callDateKey: dayKey(callDateIso),
    caller: call.client_name || "Unknown caller",
    isImportant: call.call_type !== "low_signal",
    hasTodos: todos.length > 0,
    openTodoCount: todos.filter((td) => td.status !== "done").length,
    entryType,
    entryTypeLabel: ENTRY_TYPE_LABEL[entryType],
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
 * @param {{ dateFrom?: string|null, dateTo?: string|null, callers?: string[], importantOnly?: boolean, withTodosOnly?: boolean, entryTypes?: RecordingEntryType[] }} filters
 */
export function filterCallsByMeta(rows, filters) {
  const callerSet =
    filters.callers && filters.callers.length > 0 ? new Set(filters.callers) : null;
  const typeSet =
    filters.entryTypes && filters.entryTypes.length > 0 ? new Set(filters.entryTypes) : null;
  return rows.filter((row) => {
    const m = row.meta;
    if (!m) return false;
    if (filters.dateFrom && (!m.callDateKey || m.callDateKey < filters.dateFrom)) return false;
    if (filters.dateTo && (!m.callDateKey || m.callDateKey > filters.dateTo)) return false;
    if (callerSet && !callerSet.has(m.caller)) return false;
    if (filters.importantOnly && !m.isImportant) return false;
    if (filters.withTodosOnly && !m.hasTodos) return false;
    if (typeSet && !typeSet.has(m.entryType)) return false;
    return true;
  });
}
