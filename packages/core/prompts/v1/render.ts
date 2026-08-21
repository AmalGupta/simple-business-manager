// Diarized transcript → user message — verbatim shape from docs/SCAFFOLDING.md §6.
//
// Speaker 0 is not reliably the business owner. This assumes index order
// (speaker_id "0" = BUSINESS_OWNER) per §6's documented default — confirm the
// mapping against the first few real calls before trusting it; if it flips,
// detect by matching his own phone number rather than trusting index order.

import type { DiarizedEntry } from "../../src/types";

export interface RenderInput {
  clientName: string | null;
  recordedAt: string | null;
  entries: DiarizedEntry[];
}

export function buildUserMessage(call: RenderInput): string {
  const lines = call.entries
    .map((e) => `[${e.speaker_id === "0" ? "BUSINESS_OWNER" : "CLIENT"}] ${e.transcript}`)
    .join("\n");
  return `Call with ${call.clientName ?? "an unidentified client"} on ${call.recordedAt ?? "an unknown date"}.\n\n${lines}`;
}
