// Types matching the D1 schema — see schema.sql and docs/SCAFFOLDING.md §4.

export type CallSource = "android" | "ios";
export type SttStatus = "pending" | "submitted" | "transcribed" | "extracted" | "failed";
export type TodoOwner = "self" | "customer";
export type TodoStatus = "open" | "done" | "snoozed";
export type TodoOrigin = "llm" | "manual";

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface Call {
  id: string;
  r2_key: string;
  client_id: string | null;
  source: CallSource;
  recorded_at: string | null;
  duration_s: number | null;

  stt_job_id: string | null;
  stt_status: SttStatus;
  stt_error: string | null;
  transcript: string | null;
  language_code: string | null;

  summary: string | null;
  key_takeaways: string | null; // JSON array
  unresolved: string | null; // JSON array — LLM output, never edited manually
  deadline: string | null;

  prompt_version: string | null;
  created_at: string;
}

export interface Todo {
  id: string;
  call_id: string;
  owner: TodoOwner;
  text: string;
  due_date: string | null;

  status: TodoStatus;
  snoozed_until: string | null;
  completed_at: string | null;

  customer_waiting: 0 | 1;
  origin: TodoOrigin;

  closed_by_call_id: string | null; // M1 placeholder — unused in M0
  created_at: string;
}

/** Shape produced by the `record_call` tool — see docs/SCAFFOLDING.md §6. Not wired until Task 5. */
export interface CallExtraction {
  summary: string;
  key_takeaways: string[];
  todos_customer: Array<{ text: string; due_date?: string }>;
  todos_self: Array<{ text: string; due_date?: string }>;
  unresolved: string[];
  deadline?: string;
}

/** Sarvam diarized transcript entry — see docs/SCAFFOLDING.md §5-6. */
export interface DiarizedEntry {
  speaker_id: string;
  transcript: string;
}

export interface SarvamResult {
  transcript: string;
  language_code: string;
  diarized_transcript?: { entries: DiarizedEntry[] };
}
