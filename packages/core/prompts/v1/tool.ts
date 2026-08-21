// record_call tool schema — verified shape from docs/SCAFFOLDING.md §6.
// Forced tool use, never free-text JSON: the schema is validated by the API,
// so a malformed response is impossible rather than merely unlikely.

export const EXTRACTION_TOOL = {
  name: "record_call",
  description: "Record the structured outcome of a business call.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 sentences, plain language." },
      key_takeaways: { type: "array", items: { type: "string" } },
      todos_customer: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            due_date: { type: "string", description: "ISO date, or empty if none stated." },
          },
          required: ["text"],
        },
      },
      todos_self: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            due_date: { type: "string", description: "ISO date, or empty if none stated." },
          },
          required: ["text"],
        },
      },
      unresolved: { type: "array", items: { type: "string" } },
      deadline: { type: "string", description: "Single hardest deadline. Empty if none." },
    },
    required: ["summary", "key_takeaways", "todos_customer", "todos_self", "unresolved"],
  },
} as const;
