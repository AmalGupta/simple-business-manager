// record_call tool schema — v2, superseding v1's todos_customer/todos_self
// split. See docs/ADDITIONAL_FEATURES_M0.md "Revised extraction schema" for
// the full rationale (derived from 11 real transcripts: 9 of 11 were
// internal ops calls the v1 schema couldn't represent, and the organising
// unit in speech is the site, not the client).
//
// Forced tool use, never free-text JSON: the schema is validated by the
// API, so a malformed response is impossible rather than merely unlikely.

export const EXTRACTION_TOOL = {
  name: "record_call",
  description: "Record the structured outcome of a business call.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 sentences, plain language." },
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
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            owner: {
              type: "string",
              description:
                "Who is doing this. A staff name from the known roster if a named person committed to it, the literal 'self' if the business owner committed to it himself, or the client's name/description for the rare case a customer owes something back.",
            },
            due_date: { type: "string", description: "ISO date, or empty if none stated." },
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
            resolved_datetime: { type: "string", description: "Best-effort ISO datetime resolved from raw_phrase and the call's own date. Empty if it can't be resolved." },
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
      deadline: { type: "string", description: "Single hardest deadline across the whole call, if one exists. Empty if none." },
    },
    required: ["summary", "key_takeaways", "call_type", "sites", "todos", "commitments", "unresolved", "material_needs"],
  },
} as const;
