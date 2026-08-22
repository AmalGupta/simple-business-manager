// Diarized transcript → user message. Unchanged from v1's approach — see
// docs/ADDITIONAL_FEATURES_M0.md "STT hardening" for why timestamp-based
// overlap handling (feeding diarized segments with timestamps rather than
// the merged paragraph) is NOT implemented here yet: Sarvam's diarized
// entries as currently typed (DiarizedEntry in packages/core/src/types.ts)
// carry no timestamp field, and inventing one without a verified response
// shape would violate the "don't guess an external API shape" rule in
// docs/BUILD_BRIEF.md. Confirm the real field name against a live Sarvam
// response before adding it.
//
// Speaker 0 is not reliably the business owner. This assumes index order
// (speaker_id "0" = BUSINESS_OWNER) as the default — confirm the mapping
// against real calls before trusting it; if it flips, detect by matching
// his own phone number rather than trusting index order.

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
