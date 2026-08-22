// Types matching the D1 schema — see schema.sql and docs/SCAFFOLDING.md §4.

export type CallSource = "android" | "ios";
export type SttStatus = "pending" | "transcription_in_progress" | "transcribed" | "extracted" | "failed";
/** Free text — a staff name, or the literal "self" for the business owner's own commitments. */
export type TodoOwner = string;
export type TodoStatus = "open" | "done" | "snoozed";
export type TodoOrigin = "llm" | "manual";
/** See docs/ADDITIONAL_FEATURES_M0.md "Revised extraction schema". low_signal calls get no dashboard card. */
export type CallType = "client" | "internal" | "low_signal";
export type EscalationStatus = "open" | "done";

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
  recorded_at: string | null; // when this row was uploaded
  recording_date: string | null; // recorder's own filename timestamp, if parseable
  duration_s: number | null;

  stt_job_id: string | null;
  stt_status: SttStatus;
  stt_error: string | null;

  call_type: CallType | null;
  summary: string | null;
  key_takeaways: string | null; // JSON array
  unresolved: string | null; // JSON array of { item, blocked_on } — LLM output, never edited manually
  material_needs: string | null; // JSON array of strings
  deadline: string | null;

  prompt_version: string | null;
  created_at: string;
}

/** NULL = unreviewed, 'Y' = confirmed valid, 'N' = confirmed not a real site. */
export type SiteConfirmation = "Y" | "N" | null;

export interface Site {
  id: string;
  name: string;
  is_confirmed: SiteConfirmation;
  address: string | null;
  poc_name: string | null;
  created_at: string;
}

export interface SiteTeamMember {
  id: string;
  site_id: string;
  name: string;
  contact_number: string;
  created_at: string;
}

export interface Commitment {
  id: string;
  call_id: string;
  raw_phrase: string;
  resolved_datetime: string | null;
  promised_to: string | null;
  created_at: string;
}

/** Manual only — see docs/ADDITIONAL_FEATURES_M0.md "Tile 4 — Escalations". */
export interface Escalation {
  id: string;
  text: string;
  site_id: string | null;
  status: EscalationStatus;
  created_at: string;
  closed_at: string | null;
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

/** One row per call's fetched transcript, linked by r2_key — see schema.sql. */
export interface Transcript {
  id: string;
  r2_key: string;
  transcript: string;
  summary: string | null; // placeholder — not written by any code path yet, distinct from Call.summary
  language_code: string | null;
  diarized_transcript: string | null; // JSON — DiarizedEntry[]
  fetched_at: string;
}

export interface UnresolvedItem {
  item: string;
  blocked_on?: string;
}

/** Shape produced by the `record_call` tool — see docs/ADDITIONAL_FEATURES_M0.md
    "Revised extraction schema" (supersedes the original six-field shape in
    docs/SCAFFOLDING.md §6 — todos_customer/todos_self dropped in favor of one
    owner-tagged todos[] array; call_type, sites[], commitments[], and
    material_needs[] added; unresolved[] gained blocked_on). */
export interface CallExtraction {
  summary: string;
  key_takeaways: string[];
  call_type: CallType;
  sites: string[];
  todos: Array<{ text: string; owner: string; due_date?: string }>;
  commitments: Array<{ raw_phrase: string; resolved_datetime?: string; promised_to?: string }>;
  unresolved: UnresolvedItem[];
  material_needs: string[];
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
