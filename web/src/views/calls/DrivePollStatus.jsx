import { t } from "../../theme.js";

const STEP_LABEL = {
  listing: "Scanning Drive folder",
  download: "Downloading recording",
  insert: "Saving call",
  submit: "Submitting for transcription",
  archive: "Moving to Archive",
  skip: "Skipping (family / spam)",
};

/**
 * Live Drive poll progress — current file + step, plus this cycle’s completed list.
 * progress: DrivePollProgress from GET /api/admin/drive-poll
 */
export function DrivePollStatus({ progress, lastResult }) {
  if (!progress && !lastResult) return null;

  const running = progress?.status === "running";
  const current = progress?.current;
  const completed = progress?.completed ?? [];
  const errors = progress?.errors ?? [];
  const doneCount = completed.length;
  const limit = progress?.limit ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px", minWidth: 0 }}>
      {running && current ? (
        <span style={{ fontSize: 13, color: t.edge, fontWeight: 600 }}>
          {STEP_LABEL[current.step] ?? current.step}
          {current.fileName ? ` — ${current.fileName}` : ""}
          {current.clientName ? ` (${current.clientName})` : ""}
        </span>
      ) : progress?.message ? (
        <span style={{ fontSize: 12, color: t.edge2 }}>{progress.message}</span>
      ) : lastResult ? (
        <span style={{ fontSize: 12, color: t.edge2 }}>{lastResult}</span>
      ) : null}

      {progress && (running || doneCount > 0 || errors.length > 0) ? (
        <span style={{ fontSize: 12, color: t.edge2, fontVariantNumeric: "tabular-nums" }}>
          {running ? "In this cycle: " : "Last cycle: "}
          {doneCount}/{limit || "—"} ingested
          {progress.scanned != null ? ` · scanned ${progress.scanned}` : ""}
          {progress.skippedExisting ? ` · already known ${progress.skippedExisting}` : ""}
          {errors.length ? ` · ${errors.length} error${errors.length === 1 ? "" : "s"}` : ""}
        </span>
      ) : null}

      {running && completed.length > 0 ? (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            color: t.edge2,
            maxHeight: 72,
            overflowY: "auto",
          }}
        >
          {completed.slice(-8).map((item, i) => (
            <li key={`${item.fileName}-${i}`}>
              {item.clientName}: {item.skipped ? "skipped" : item.archived ? "archived, transcription started" : "ingested"}
            </li>
          ))}
        </ul>
      ) : null}

      {errors.length > 0 ? (
        <span style={{ fontSize: 12, color: t.signal }}>
          {errors[errors.length - 1].fileName}: {errors[errors.length - 1].error}
        </span>
      ) : null}
    </div>
  );
}
