// Site scan — a small, cheap Haiku pass over every new call's transcript,
// dedicated to finding site/project references. Runs alongside (not instead
// of) the main Sonnet extraction's own sites[] field — see the "Relation to
// existing" decision in the conversation that added this: both write into
// the same `sites` table via upsertSite, so neither is authoritative and
// there's no coordination needed between them.
//
// Deliberately a separate, minimal tool rather than reusing record_call:
// this call has exactly one job, so a focused schema keeps it fast and cheap
// rather than asking Haiku to reason about the full six-field shape.
//
// New sites this discovers land with is_confirmed = NULL (unreviewed) — see
// docs/ADDITIONAL_FEATURES_M0.md and migrations/0007_site_confirmation.sql.
// A human confirms or rejects them on the sites review screen before they're
// trusted anywhere that matters (the extraction vocabulary is NOT wired to
// this table yet — it still reads the static roster in roster.ts).

import { SITE_ROSTER } from "./roster";
import type { DiarizedEntry } from "../src/types";
import {
  ANTHROPIC_MESSAGES_URL,
  anthropicRequestHeaders,
  cachedSystemPrompt,
  withCachedTool,
} from "./anthropic";

const SITE_SCAN_TOOL = {
  name: "record_sites",
  description: "Record every site or project location mentioned in this call.",
  input_schema: {
    type: "object",
    properties: {
      sites: {
        type: "array",
        items: { type: "string" },
        description:
          "Every site/project name mentioned, matched to the known roster where possible. Empty array if none were mentioned — do not guess.",
      },
    },
    required: ["sites"],
  },
} as const;

const SITE_SCAN_SYSTEM_PROMPT = `You read a transcript of a business phone call and identify every site or project location mentioned, using the record_sites tool.

Rules:
1. Extract only sites actually named in the transcript. Never infer or guess a site from context.
2. Match spoken references to the known roster below even when spoken as Hindi numerals (सत्तर = Sector 70, एक सौ छह = Sector 106, पैंतीस = Sector 35).
3. If a site is clearly named but isn't on the roster, include it as spoken — the roster is provisional and grows from real calls.
4. If nothing site-related was said, return an empty array. An invented site is worse than a missed one.

Known sites (spelling and number transcription can drift — match to these names):
${SITE_ROSTER.join(", ")}`;

function buildUserMessage(entries: DiarizedEntry[]): string {
  return entries.map((e) => `[${e.speaker_id === "0" ? "BUSINESS_OWNER" : "CLIENT"}] ${e.transcript}`).join("\n");
}

export interface SiteScanInput {
  apiKey: string;
  model: string;
  entries: DiarizedEntry[];
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; input?: unknown }>;
}

/** Never throws on a malformed/missing tool_use — a failed site scan should never take down the main extraction. */
export async function scanCallForSites(input: SiteScanInput): Promise<string[]> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicRequestHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.model,
      max_tokens: 500,
      system: cachedSystemPrompt(SITE_SCAN_SYSTEM_PROMPT),
      tools: [withCachedTool(SITE_SCAN_TOOL)],
      tool_choice: { type: "tool", name: "record_sites" },
      messages: [{ role: "user", content: buildUserMessage(input.entries) }],
    }),
  });

  if (!res.ok) throw new Error(`Site scan failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as AnthropicMessageResponse;
  const block = data.content.find((b) => b.type === "tool_use");
  const raw = (block?.input as { sites?: unknown } | undefined)?.sites;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
}
