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
  withCachedTool,
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
      system: cachedSystemPrompt(ACTIVE.system),
      tools: [withCachedTool(ACTIVE.tool)],
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
  return normalizeExtraction(block.input);
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
function normalizeExtraction(input: unknown): CallExtraction {
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

  return {
    summary: raw.summary,
    key_takeaways: asStringArray(raw.key_takeaways),
    call_type: callType,
    sites: asStringArray(raw.sites),
    todos,
    commitments,
    unresolved,
    material_needs: asStringArray(raw.material_needs),
    deadline: typeof raw.deadline === "string" ? raw.deadline : undefined,
  };
}
