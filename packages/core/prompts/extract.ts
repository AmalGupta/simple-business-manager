// One call per transcript, structured record out — shape from
// docs/ADDITIONAL_FEATURES_M0.md "Revised extraction schema" (v2 prompt).
// Shared between the webhook handler (src/handlers/stt-webhook.ts) and the
// offline eval runner (evals/run.ts), so it takes plain params rather than
// the Worker Env.
//
// Note: Sonnet 5 manages sampling internally and rejects `temperature` and
// `top_p` — do not set them, the request will fail.

import { ACTIVE } from "./index";
import type { CallExtraction, DiarizedEntry } from "../src/types";
import {
  ANTHROPIC_MESSAGES_URL,
  anthropicRequestHeaders,
  cachedSystemPrompt,
} from "./anthropic";
export interface ExtractInput {
  apiKey: string;
  model: string;
  clientName: string | null;
  recordedAt: string | null;
  entries: DiarizedEntry[];
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; input?: unknown }>;
}

export async function extractCall(input: ExtractInput): Promise<CallExtraction> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicRequestHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.model,
      max_tokens: 2000,
      system: cachedSystemPrompt(ACTIVE.system, input.model),
      tools: [ACTIVE.tool],
      tool_choice: { type: "tool", name: "record_call" },
      messages: [
        {
          role: "user",
          content: ACTIVE.buildUserMessage({
            clientName: input.clientName,
            recordedAt: input.recordedAt,
            entries: input.entries,
          }),
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic extraction failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as AnthropicMessageResponse;
  const block = data.content.find((b) => b.type === "tool_use");
  if (!block) throw new Error("no tool_use block returned");
  return normalizeExtraction(block.input, input.entries);
}

const VALID_CALL_TYPES = new Set(["client", "internal", "low_signal"]);

/**
 * Forced tool_choice makes a schema-violating response unlikely, not
 * impossible — confirmed live 2026-08-21 against v1's shape: a real call's
 * tool_use.input came back with todos_customer missing/non-array, which
 * crashed saveExtraction before its db.batch() ran, silently losing an
 * otherwise-valid summary and key_takeaways along with it. Coerce array
 * fields defensively so one malformed field degrades gracefully instead of
 * losing the whole extraction.
 */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Guards against a confirmed prompt-instruction-following failure: the model
 * reads the "Call with X on Y" preamble line (built from clientName, see
 * ACTIVE.buildUserMessage) and echoes a site name from it into `sites`, even
 * when that name was never spoken in the transcript body — reproduced live
 * 2026-09-04 even after the v5 system prompt explicitly forbade it (rule 1,
 * rule 7). Prompt wording alone wasn't enough, so this is a code-level
 * backstop, not a replacement for the prompt rule.
 *
 * First attempt at this backstop compared the site string against clientName
 * and trusted anything on SITE_ROSTER unconditionally — wrong, because the
 * leaked values ("Homeland", "Regalia") are themselves real roster sites
 * that happen to also appear in this client's name; roster membership can't
 * disambiguate "genuinely mentioned" from "echoed from metadata" when both
 * are true of the same string. The only thing that actually distinguishes
 * them is whether the site was spoken in the transcript itself — so this
 * checks the entries text directly, not clientName, and does NOT special-case
 * roster membership.
 *
 * Requires only ONE word to match, not all of them — a compound roster name
 * like "Eco City / Mullanpur" is often spoken as just "Mullanpur", and
 * requiring "Eco" and "City" too would drop a legitimately-mentioned site.
 * Short words (<3 chars) are ignored as match candidates to avoid a trivial
 * word like "hi"/"ok" coincidentally matching. Known limitation: this checks
 * the model's already-roster-resolved output string against the raw
 * transcript text, so a site spoken only as a Hindi numeral (सत्तर, एक सौ
 * छह — see system.ts rule 7) won't textually match its resolved digit form
 * and could be dropped; no golden case exercises that path yet, so it's
 * unverified rather than fixed.
 */
function isMentionedInTranscript(site: string, entries: DiarizedEntry[]): boolean {
  const siteWords = normalizeWords(site).filter((w) => w.length >= 3);
  if (siteWords.length === 0) return true; // nothing substantial to check against — don't false-drop
  const transcriptWords = normalizeWords(entries.map((e) => e.transcript).join(" "));
  return siteWords.some((sw) => transcriptWords.some((tw) => sw === tw || levenshtein(sw, tw) <= 1));
}

function normalizeExtraction(input: unknown, entries: DiarizedEntry[] = []): CallExtraction {
  const raw = (input ?? {}) as Partial<Record<keyof CallExtraction, unknown>>;
  const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const asStringArray = (v: unknown): string[] => asArray<unknown>(v).filter((x): x is string => typeof x === "string");

  if (typeof raw.summary !== "string") throw new Error("extraction response missing summary");

  const callType = typeof raw.call_type === "string" && VALID_CALL_TYPES.has(raw.call_type)
    ? (raw.call_type as CallExtraction["call_type"])
    : "internal"; // conservative default: an internal card he can ignore beats a dropped call

  const todos = asArray<Record<string, unknown>>(raw.todos)
    .filter((t) => typeof t?.text === "string" && typeof t?.owner === "string")
    .map((t) => ({
      text: t.text as string,
      owner: t.owner as string,
      due_date: typeof t.due_date === "string" ? t.due_date : undefined,
    }));

  const commitments = asArray<Record<string, unknown>>(raw.commitments)
    .filter((c) => typeof c?.raw_phrase === "string")
    .map((c) => ({
      raw_phrase: c.raw_phrase as string,
      resolved_datetime: typeof c.resolved_datetime === "string" ? c.resolved_datetime : undefined,
      promised_to: typeof c.promised_to === "string" ? c.promised_to : undefined,
    }));

  const unresolved = asArray<Record<string, unknown>>(raw.unresolved)
    .filter((u) => typeof u?.item === "string")
    .map((u) => ({
      item: u.item as string,
      blocked_on: typeof u.blocked_on === "string" ? u.blocked_on : undefined,
    }));

  const sites = asStringArray(raw.sites).filter((site) => {
    if (isMentionedInTranscript(site, entries)) return true;
    console.warn(`[extract] dropped site "${site}" — not found in transcript, likely echoed from call metadata`);
    return false;
  });

  return {
    summary: raw.summary,
    key_takeaways: asStringArray(raw.key_takeaways),
    call_type: callType,
    sites,
    todos,
    commitments,
    unresolved,
    material_needs: asStringArray(raw.material_needs),
    deadline: typeof raw.deadline === "string" ? raw.deadline : undefined,
  };
}
