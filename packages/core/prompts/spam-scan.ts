// Spam scan — a small, cheap Haiku pass over a new call's transcript,
// dedicated to deciding whether the call is spam/telemarketing/a scam
// rather than a real business call. Runs only for calls whose caller isn't
// already known as family/staff/spam (see src/handlers/stt-webhook.ts) —
// staff calls are trusted and skip this entirely, and family calls never
// reach transcription at all.
//
// Deliberately a separate, minimal tool rather than folding this into the
// main record_call extraction: a spam verdict has to be checked BEFORE
// deciding whether to run that extraction at all, so it needs its own
// cheap, focused call.
//
// A true verdict causes the caller's directory entry to be marked spam and
// the call soft-deleted — see markCallerSpam/softDeleteCallAsSpam in
// packages/core/src/queries.ts. Getting this wrong in either direction has
// asymmetric cost, which the system prompt below states explicitly.

import type { DiarizedEntry } from "../src/types";
import {
  ANTHROPIC_MESSAGES_URL,
  anthropicRequestHeaders,
  cachedSystemPrompt,
  withCachedTool,
} from "./anthropic";

const SPAM_SCAN_TOOL = {
  name: "record_spam_verdict",
  description: "Decide whether this call is spam, telemarketing, or a scam, as opposed to a real business call.",
  input_schema: {
    type: "object",
    properties: {
      is_spam: {
        type: "boolean",
        description:
          "True if this is spam, telemarketing, a scam call, a robocall, or a wrong-number solicitation — not a real client, staff, or business call.",
      },
      reason: {
        type: "string",
        description: "One short sentence explaining the verdict, for the admin's audit trail.",
      },
    },
    required: ["is_spam", "reason"],
  },
} as const;

const SPAM_SCAN_SYSTEM_PROMPT = `You read a transcript of a business phone call for a glass/aluminium installation business and decide whether it is spam, using the record_spam_verdict tool.

Rules:
1. Spam means telemarketing, a scam, a robocall, or a wrong-number solicitation — not a real client, staff, or business call.
2. A short, confused, or low-content call is NOT automatically spam. Only mark is_spam = true when the content is clearly telemarketing/scam/robocall in nature.
3. When uncertain, prefer is_spam = false — a missed spam call costs nothing; a wrongly-flagged real call gets silently deleted.`;

function buildUserMessage(entries: DiarizedEntry[]): string {
  return entries.map((e) => `[${e.speaker_id === "0" ? "BUSINESS_OWNER" : "CLIENT"}] ${e.transcript}`).join("\n");
}

export interface SpamScanInput {
  apiKey: string;
  model: string;
  entries: DiarizedEntry[];
}

export interface SpamScanResult {
  isSpam: boolean;
  reason: string;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; input?: unknown }>;
}

const NOT_SPAM: SpamScanResult = { isSpam: false, reason: "no verdict returned" };

/** Never throws on a malformed/missing tool_use — treated as not-spam (see rule 3 above). Network/API failures still throw; the caller (stt-webhook.ts) treats any thrown error the same way, falling through to normal extraction. */
export async function scanCallForSpam(input: SpamScanInput): Promise<SpamScanResult> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicRequestHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.model,
      max_tokens: 300,
      system: cachedSystemPrompt(SPAM_SCAN_SYSTEM_PROMPT),
      tools: [withCachedTool(SPAM_SCAN_TOOL)],
      tool_choice: { type: "tool", name: "record_spam_verdict" },
      messages: [{ role: "user", content: buildUserMessage(input.entries) }],
    }),
  });

  if (!res.ok) throw new Error(`Spam scan failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as AnthropicMessageResponse;
  const block = data.content.find((b) => b.type === "tool_use");
  const raw = block?.input as { is_spam?: unknown; reason?: unknown } | undefined;
  if (!raw || typeof raw.is_spam !== "boolean") return NOT_SPAM;
  return { isSpam: raw.is_spam, reason: typeof raw.reason === "string" ? raw.reason : "" };
}
