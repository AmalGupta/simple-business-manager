// Diarized transcript → user message (v3). Same speaker labeling as v2, plus
// an explicit Asia/Kolkata calendar day and kal tense resolution hint so
// relative due dates are anchored.

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

export function buildUserMessage(call: RenderInput): string {
  const lines = call.entries
    .map((e) => `[${e.speaker_id === "0" ? "BUSINESS_OWNER" : "CLIENT"}] ${e.transcript}`)
    .join("\n");
  const calendarDay = callCalendarDayKolkata(call.recordedAt);
  return (
    `Call with ${call.clientName ?? "an unidentified client"} on ${call.recordedAt ?? "an unknown date"}.\n` +
    `Call calendar day (Asia/Kolkata): ${calendarDay}. Resolve कल/kal using tense after the day-word: future → day+1, past → day−1.\n\n` +
    lines
  );
}
