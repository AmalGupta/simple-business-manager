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

  /** Set only for a voice memo uploaded explicitly from a site's page — see queries.ts insertCall. */
  recorded_for_site_id: string | null;
  uploaded_by_user_id: string | null;
  /** migration 0016: set when this call is the required voice note for one installation checklist row. */
  installation_update_id: string | null;

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
  /** Admin/superadmin-editable ISO date — see migration 0012. */
  target_closure_date: string | null;
}

export interface SiteTeamMember {
  id: string;
  site_id: string;
  name: string;
  contact_number: string;
  added_by: string | null;
  /** Links to a real login account when assigned via the dropdown — see migration 0011. NULL for legacy free-text rows. */
  user_id: string | null;
  created_at: string;
}

/** 'staff' lands on a filtered Sites view; 'admin'/'superadmin' get the full dashboard. See migration 0011. */
export type UserRole = "staff" | "admin" | "superadmin";

export interface User {
  id: string;
  name: string;
  pin_hash: string;
  pin_salt: string;
  failed_attempts: number;
  locked_until: string | null;
  disabled_at: string | null;
  created_at: string;
  role: UserRole;
  phone: string | null;
  /** AES-GCM ciphertext of the current raw PIN — see src/lib/auth.ts encryptPin/decryptPin. NULL until set/reset under this scheme. */
  pin_encrypted: string | null;
}

export interface Session {
  token_hash: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export type SiteMediaType = "photo" | "video";

export interface SiteMedia {
  id: string;
  site_id: string;
  media_type: SiteMediaType;
  r2_key: string;
  content_type: string;
  file_size: number | null;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
  /** migration 0016: set when this documents a specific installation checklist row. */
  installation_update_id: string | null;
}

export interface SiteEdit {
  id: string;
  site_id: string;
  actor_user_id: string | null;
  summary: string;
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
export type EscalationSource = "admin" | "staff_field";

export interface Escalation {
  id: string;
  text: string;
  site_id: string | null;
  status: EscalationStatus;
  created_at: string;
  closed_at: string | null;
  /** migration 0016: who filed it — NULL for pre-existing admin-typed rows. */
  created_by_user_id: string | null;
  source: EscalationSource;
  /** Set when filed from a specific installation checklist row; NULL for a site-level complaint. */
  installation_update_id: string | null;
  assigned_to_user_id: string | null;
  assigned_by_user_id: string | null;
  assigned_at: string | null;
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

  assigned_to_user_id: string | null;
  assigned_by_user_id: string | null;
  assigned_at: string | null;
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

/** See migration 0013 — the "Process Aluminium" catalog, grouped for the home-page tiles. Not a pipeline order. */
export type WorkflowCategory =
  | "admin_intake"
  | "measurement"
  | "procurement"
  | "production"
  | "quality_control"
  | "installation"
  | "handover"
  | "billing_delivery";

/** Staff must not see tiles, lists, or assignments in these categories — admin-only intake. */
export const STAFF_HIDDEN_WORKFLOW_CATEGORIES: readonly WorkflowCategory[] = ["admin_intake"];

export interface WorkflowStage {
  id: string;
  label: string;
  category: WorkflowCategory;
}

export type SiteTaskStatus = "unassigned" | "assigned" | "done";

export interface SiteTask {
  id: string;
  site_id: string;
  stage_id: string;
  status: SiteTaskStatus;
  assigned_to_user_id: string | null;
  assigned_by_user_id: string | null;
  assigned_at: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  created_at: string;
}

/**
 * See migration 0016 — a physical instance at a site (a site can have
 * many): a window/opening for "installation", a visit for "measurement",
 * a delivery event for "material_delivery". All three site-visit
 * categories share this one table and the same checklist pattern
 * (migration 0017) rather than being separate near-identical concepts.
 */
export type InstallationCategory = "installation" | "measurement" | "material_delivery";

export interface Installation {
  id: string;
  site_id: string;
  label: string;
  created_by: string;
  created_at: string;
  category: InstallationCategory;
}

/** The 6-row field-report checklist per installation — see docs/DESIGN_LANGUAGE.md-adjacent plan notes. */
export type InstallationUpdateCategory =
  | "location"
  | "work_done"
  | "work_pending"
  | "material_short"
  | "complaints"
  | "site_delay";

export interface InstallationUpdate {
  id: string;
  installation_id: string;
  category: InstallationUpdateCategory;
  voice_note_call_id: string | null;
  reported_by_user_id: string;
  created_at: string;
}

export type MaterialShortageStatus = "open" | "fulfilled";

export interface MaterialShortage {
  id: string;
  site_id: string;
  installation_id: string | null;
  installation_update_id: string | null;
  description: string | null;
  status: MaterialShortageStatus;
  reported_by_user_id: string;
  reported_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
}
