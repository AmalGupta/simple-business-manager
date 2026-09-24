// Diarized transcript → user message (v7). Unchanged from v6 — v7's change
// is todos[].site in tool.ts / system.ts.

import type { DiarizedEntry } from "../../src/types";

export interface RenderInput {
  clientName: string | null;
  recordedAt: string | null;
  entries: DiarizedEntry[];
}

function callCalendarDayKolkata(recordedAt: string | null): string {
  const d = recordedAt ? new Date(recordedAt) : new Date();
  const instant = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Untagged when every entry shares one speaker_id (including the single-entry flat-transcript fallback) — tagging a monologue with SPEAKER_1 everywhere is noise, not signal. */
function renderLines(entries: DiarizedEntry[]): string {
  const distinctSpeakers = new Set(entries.map((e) => e.speaker_id));
  if (distinctSpeakers.size <= 1) {
    return entries.map((e) => e.transcript).join("\n");
  }
  return entries.map((e) => `[SPEAKER_${e.speaker_id}] ${e.transcript}`).join("\n");
}

export function buildUserMessage(call: RenderInput): string {
  const calendarDay = callCalendarDayKolkata(call.recordedAt);
  return (
    `Call with ${call.clientName ?? "an unidentified client"} on ${call.recordedAt ?? "an unknown date"}.\n` +
    `Call calendar day (Asia/Kolkata): ${calendarDay}. Resolve कल/kal using tense after the day-word: future → day+1, past → day−1.\n\n` +
    renderLines(call.entries)
  );
}
