// Diarized transcript → user message (v5). Unchanged from v4 — the v5 fix
// (system.ts rule 1: don't extract sites/etc. from the preamble line below)
// is prompt-only. Same calendar-day anchoring as v3. No more index-based
// BUSINESS_OWNER/CLIENT speaker_id mapping — a real call returned 3 detected
// speakers against a 2-speaker request with one stray misattributed line,
// which v3's `speaker_id === "0" ? BUSINESS_OWNER : CLIENT` would have
// mislabeled outright. Speaker turns are tagged with neutral SPEAKER_n
// labels (or left untagged entirely when there's effectively one block of
// text, e.g. the src/handlers/stt-webhook.ts fallback for a call with no
// diarized_transcript at all). Role identification is the model's job via
// system.ts rule 6, not this function's.

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
