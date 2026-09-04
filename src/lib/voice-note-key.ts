// Human-readable R2 keys for the VOICE_NOTES bucket — see
// docs/VOICE_NOTE_BUCKET_PLAN.md. Mirrors the Drive filename convention
// (`Call recording <Name>_<YYMMDD>_<HHMMSS>.m4a`) so the bucket reads the
// same way the Drive folder does, rather than opaque UUID keys.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Strips characters R2 keys tolerate poorly and collapses whitespace, so a
 * caller/staff name or free-text label is safe to drop straight into a key. */
export function sanitizeForKey(raw: string, maxLength = 60): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = cleaned.slice(0, maxLength).replace(/-+$/g, "");
  return truncated || "Unknown";
}

function timestampIST(iso: string): string {
  const utcMillis = new Date(iso).getTime();
  const ist = new Date(utcMillis + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = ist.getUTCFullYear();
  const mo = pad(ist.getUTCMonth() + 1);
  const d = pad(ist.getUTCDate());
  const h = pad(ist.getUTCHours());
  const mi = pad(ist.getUTCMinutes());
  const s = pad(ist.getUTCSeconds());
  return `${y}${mo}${d}_${h}${mi}${s}`;
}

/**
 * `<Speaker>_<YYYYMMDD>_<HHMMSS>_<shortId>.<ext>` — speaker/metadata segments
 * are sanitized and joined with `-`; the trailing shortId (first 8 chars of
 * the row's own UUID) guarantees uniqueness even if two speakers' sanitized
 * labels collide in the same second. `r2_key` is `NOT NULL UNIQUE` in the
 * `calls` schema and the join key to `transcripts`, so this must never repeat.
 */
export function buildVoiceNoteKey(opts: {
  speaker: string;
  metadata?: string[];
  recordedAtIso: string;
  id: string;
  ext: string;
}): string {
  const segments = [opts.speaker, ...(opts.metadata ?? [])].map((s) => sanitizeForKey(s));
  const label = segments.join("-");
  const shortId = opts.id.replace(/-/g, "").slice(0, 8);
  return `${label}_${timestampIST(opts.recordedAtIso)}_${shortId}.${opts.ext}`;
}
