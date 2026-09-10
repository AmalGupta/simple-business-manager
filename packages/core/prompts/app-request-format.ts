// Formats a spoken staff/admin request (a Sarvam transcript) into structured
 // fields for the My requests grid and the Jira issue — see the app-request
 // branch of src/handlers/stt-webhook.ts. Deliberately its own small tool
 // rather than folded into the call extraction pipeline: the input is one
 // person's short spoken request, not a diarized two-party call.

import { ANTHROPIC_MESSAGES_URL, anthropicRequestHeaders, cachedSystemPrompt } from "./anthropic";

const FORMAT_REQUEST_MAX_TOKENS = 700;

const FORMAT_REQUEST_TOOL = {
  name: "format_request",
  description:
    "Turn a spoken feature request or bug report into a speaker name, short title, and clear summary for Jira and the My requests grid.",
  input_schema: {
    type: "object",
    properties: {
      speaker_name: {
        type: "string",
        description:
          "Who is speaking the request. Prefer the known submitter name when provided; only override if the transcript clearly names a different person.",
      },
      title: {
        type: "string",
        description:
          'A short imperative summary, under 80 characters — what should change (e.g. "Add CSV export to the Sites page"), not a quote of what was said.',
      },
      summary: {
        type: "string",
        description:
          "A clear 2-5 sentence summary of the request/issue in plain language, expanding on what was said. Drop filler words, false starts, and repetition. Never invent details that weren't actually said.",
      },
    },
    required: ["speaker_name", "title", "summary"],
  },
} as const;

const FORMAT_REQUEST_SYSTEM_PROMPT = `You read a transcript of someone speaking a feature request or bug report into a business app called Simple Business Manager, and turn it into structured fields using the format_request tool.

Rules:
1. speaker_name: use the known submitter name when one is given, unless the transcript clearly identifies a different speaker.
2. title: a short imperative summary of what should change, not a quote of what was said.
3. summary: read like a clearly-written issue, not a transcript — drop filler words, false starts, and repetition, but never invent details that weren't actually said.
4. If the transcript is too garbled, empty, or short to make sense of, say so plainly in the summary rather than guessing at intent, and still return a short title.`;

export interface FormatRequestInput {
  apiKey: string;
  model: string;
  transcript: string;
  /** Logged-in submitter — Claude should prefer this for speaker_name. */
  knownSubmitterName: string;
}

export interface FormatRequestResult {
  speakerName: string;
  title: string;
  summary: string;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; input?: unknown }>;
}

function buildFormatRequestUserMessage(input: { transcript: string; knownSubmitterName: string }): string {
  return [
    `Known submitter name: ${input.knownSubmitterName.trim() || "(unknown)"}`,
    "",
    "Transcript:",
    input.transcript.trim() || "(empty transcript)",
  ].join("\n");
}

export async function formatSpokenRequest(input: FormatRequestInput): Promise<FormatRequestResult> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicRequestHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.model,
      max_tokens: FORMAT_REQUEST_MAX_TOKENS,
      system: cachedSystemPrompt(FORMAT_REQUEST_SYSTEM_PROMPT, input.model),
      tools: [FORMAT_REQUEST_TOOL],
      tool_choice: { type: "tool", name: "format_request" },
      messages: [{ role: "user", content: buildFormatRequestUserMessage(input) }],
    }),
  });

  if (!res.ok) throw new Error(`Request formatting failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as AnthropicMessageResponse;
  const block = data.content.find((b) => b.type === "tool_use");
  const raw = block?.input as { speaker_name?: unknown; title?: unknown; summary?: unknown } | undefined;
  if (
    !raw ||
    typeof raw.speaker_name !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string"
  ) {
    throw new Error("format_request tool returned no usable output");
  }
  return {
    speakerName: raw.speaker_name.trim() || input.knownSubmitterName,
    title: raw.title.trim(),
    summary: raw.summary.trim(),
  };
}
