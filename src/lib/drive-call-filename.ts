// Cube ACR / phone recorder filenames in the shared Drive "Calls" folder:
//   Call recording <Caller Name>_<YYMMDD>_<HHMMSS>.m4a
//   Call recording <Phone>_<YYMMDD>_<HHMMSS>.m4a
// Also tolerates a space before the date stamp (docs form).

const CALL_FILENAME_RE = /^Call recording (.+?)[ _](\d{6})_(\d{6})\./i;
const PHONE_RE = /^\+?\d[\d\s-]{6,}\d$/;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface ParsedDriveCallFilename {
  callerLabel: string;
  phone: string | null;
  /** ISO UTC from the filename wall-clock (treated as IST). */
  recordedAt: string | null;
}

function yymmddHhmmssToIso(datePart: string, timePart: string): string | null {
  if (!/^\d{6}$/.test(datePart) || !/^\d{6}$/.test(timePart)) return null;
  const yy = Number(datePart.slice(0, 2));
  const month = Number(datePart.slice(2, 4));
  const day = Number(datePart.slice(4, 6));
  const hour = Number(timePart.slice(0, 2));
  const minute = Number(timePart.slice(2, 4));
  const second = Number(timePart.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Cube ACR uses 2-digit years; treat 00–69 as 2000s.
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
  return new Date(utcMillis).toISOString();
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function parseDriveCallFilename(fileName: string): ParsedDriveCallFilename {
  const match = fileName.match(CALL_FILENAME_RE);
  if (!match) {
    return { callerLabel: "Unknown caller", phone: null, recordedAt: null };
  }
  const label = match[1]!.trim();
  const recordedAt = yymmddHhmmssToIso(match[2]!, match[3]!);
  if (PHONE_RE.test(label)) {
    const phone = normalizePhone(label);
    return { callerLabel: phone, phone, recordedAt };
  }
  return { callerLabel: label, phone: null, recordedAt };
}

/** Content-Type for Sarvam — Drive often labels .m4a as video/3gpp. */
export function contentTypeForDriveCall(fileName: string, driveContentType: string | null): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".3gp") || lower.endsWith(".3gpp")) return "audio/3gpp";
  const base = (driveContentType ?? "").split(";")[0]?.trim();
  return base || "application/octet-stream";
}
