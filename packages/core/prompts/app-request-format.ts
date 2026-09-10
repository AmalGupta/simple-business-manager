// Formats a spoken staff/admin request (a Sarvam transcript) into a clean
// Jira title + description — see the app-request branch of
// src/handlers/stt-webhook.ts, which calls this once the transcript lands,
// then hands the result to src/lib/jira.ts. Deliberately its own small tool
// rather than folded into the call extraction pipeline: the input is one
// person's short spoken request, not a diarized two-party call, and the
// output shape (title/description) has nothing in common with record_call.

import { ANTHROPIC_MESSAGES_URL, anthropicRequestHeaders, cachedSystemPrompt } from "./anthropic";

const FORMAT_REQUEST_TOOL = {
  name: "format_request",
  description: "Turn a spoken feature request or bug report into a clean Jira issue title and description.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "A short imperative summary, under 80 characters — what should change (e.g. \"Add CSV export to the Sites page\"), not a quote of what was said.",
      },
      description: {
        type: "string",
        description:
          "A clear 2-5 sentence description of the request/issue in plain language, expanding on what was said. Drop filler words, false starts, and repetition. Never invent details that weren't actually said.",
      },
    },
    required: ["title", "description"],
  },
} as const;

const FORMAT_REQUEST_SYSTEM_PROMPT = `You read a transcript of someone speaking a feature request or bug report into a business app called Simple Business Manager, and turn it into a clean Jira issue using the format_request tool.

Rules:
1. Write the title as a short imperative summary of what should change, not a quote of what was said.
2. The description should read like a clearly-written issue, not a transcript — drop filler words, false starts, and repetition, but never invent details that weren't actually said.
3. If the transcript is too garbled, empty, or short to make sense of, say so plainly in the description rather than guessing at intent.`;

export interface FormatRequestInput {
  apiKey: string;
  model: string;
  transcript: string;
}

export interface FormatRequestResult {
  title: string;
  description: string;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; input?: unknown }>;
}

export async function formatSpokenRequest(input: FormatRequestInput): Promise<FormatRequestResult> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicRequestHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.model,
      max_tokens: 500,
      system: cachedSystemPrompt(FORMAT_REQUEST_SYSTEM_PROMPT, input.model),
      tools: [FORMAT_REQUEST_TOOL],
      tool_choice: { type: "tool", name: "format_request" },
      messages: [{ role: "user", content: input.transcript.trim() || "(empty transcript)" }],
    }),
  });

  if (!res.ok) throw new Error(`Request formatting failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as AnthropicMessageResponse;
  const block = data.content.find((b) => b.type === "tool_use");
  const raw = block?.input as { title?: unknown; description?: unknown } | undefined;
  if (!raw || typeof raw.title !== "string" || typeof raw.description !== "string") {
    throw new Error("format_request tool returned no usable output");
  }
  return { title: raw.title, description: raw.description };
}
