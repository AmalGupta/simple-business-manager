// record_call tool schema — v4. Unchanged from v3; this version's changes are
// in system.ts (owner-attribution rule simplified) and render.ts (no more
// BUSINESS_OWNER/CLIENT speaker_id guessing). Never edit a shipped version in
// place — changes create v5/.

export const EXTRACTION_TOOL = {
  name: "record_call",
  description: "Record the structured outcome of a business call.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 sentences, plain language. Do not use summary as a substitute for todos on dispatch/planning calls." },
      key_takeaways: { type: "array", items: { type: "string" } },
      call_type: {
        type: "string",
        enum: ["client", "internal", "low_signal"],
        description:
          "'client' if speaking with a customer. 'internal' if speaking with staff (dispatch, staffing, material movement, production status). " +
          "'low_signal' if the call is a pure attendance roll-call or otherwise produced no durable information — use this generously; a low_signal call gets no dashboard card.",
      },
      sites: {
        type: "array",
        items: { type: "string" },
        description:
          "Every site mentioned, matched to the known site list where possible. Plural — one call can touch several sites in a few minutes; do not collapse to one.",
      },
      todos: {
        type: "array",
        description:
          "Each named person+task assignment on internal dispatch/planning calls must appear here (one todo per assignment). Do not leave this empty when the transcript clearly assigns work.",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            owner: {
              type: "string",
              description:
                "Who is doing this. A staff name from the known roster if a named person committed to it, the literal 'self' if the business owner committed to it himself, or the client's name/description for the rare case a customer owes something back.",
            },
            due_date: {
              type: "string",
              description:
                "ISO date YYYY-MM-DD. Resolve relative day-words (कल/kal, aaj, parso) against the call calendar day in the user message: kal future tense → day+1, kal past tense → day−1. Empty only if no day was spoken.",
            },
          },
          required: ["text", "owner"],
        },
      },
      commitments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            raw_phrase: { type: "string", description: "The time/date exactly as spoken, e.g. 'कल सुबह अर्ली' or 'साढ़े दस बजे'." },
            resolved_datetime: {
              type: "string",
              description:
                "Best-effort ISO datetime resolved from raw_phrase and the call calendar day (same kal tense rules as todos.due_date). Empty if it can't be resolved.",
            },
            promised_to: { type: "string", description: "Who the commitment was made to, if identifiable. Empty if unclear." },
          },
          required: ["raw_phrase"],
        },
      },
      unresolved: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            blocked_on: { type: "string", description: "The person who could resolve this, if the transcript names one. Empty if nobody was named." },
          },
          required: ["item"],
        },
      },
      material_needs: {
        type: "array",
        items: { type: "string" },
        description: "Shortages or awaited stock mentioned — e.g. 'Georgian glass — 10-20 more pieces needed'. Not a ledger; only what was actually said.",
      },
      deadline: {
        type: "string",
        description:
          "Single hardest deadline across the whole call, if one exists. Resolve relative day-words against the call calendar day. Empty if none.",
      },
    },
    required: ["summary", "key_takeaways", "call_type", "sites", "todos", "commitments", "unresolved", "material_needs"],
  },
} as const;
