// One call per transcript, six fields out — verified request shape from
// docs/SCAFFOLDING.md §6. Shared between the webhook handler (src/handlers/
// stt-webhook.ts) and the offline eval runner (evals/run.ts), so it takes
// plain params rather than the Worker Env.
//
// Note: Sonnet 5 manages sampling internally and rejects `temperature` and
// `top_p` — do not set them, the request will fail.

import { ACTIVE } from "./index";
import type { CallExtraction, DiarizedEntry } from "../src/types";

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
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 2000,
      system: ACTIVE.system,
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
  return normalizeExtraction(block.input);
}

/**
 * Forced tool_choice makes a schema-violating response unlikely, not
 * impossible — confirmed live 2026-08-21: a real call's tool_use.input came
 * back with todos_customer missing/non-array, which crashed saveExtraction
 * before its db.batch() ran, silently losing an otherwise-valid summary and
 * key_takeaways along with it. Coerce array fields defensively so one
 * malformed field degrades gracefully instead of losing the whole extraction.
 */
function normalizeExtraction(input: unknown): CallExtraction {
  const raw = (input ?? {}) as Partial<Record<keyof CallExtraction, unknown>>;
  const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  if (typeof raw.summary !== "string") throw new Error("extraction response missing summary");

  return {
    summary: raw.summary,
    key_takeaways: asArray(raw.key_takeaways),
    todos_customer: asArray(raw.todos_customer),
    todos_self: asArray(raw.todos_self),
    unresolved: asArray(raw.unresolved),
    deadline: typeof raw.deadline === "string" ? raw.deadline : undefined,
  };
}
