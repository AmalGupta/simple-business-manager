import { useState } from "react";
import { t } from "../../theme.js";
import { postTaskComplete } from "../../lib/api.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../Modal.jsx";
import { UpdateComposer, emptySection, isSectionEmpty } from "./UpdateComposer.jsx";
import { useT } from "../../lib/i18n.jsx";

/* SBM-103 — marking a task done asks what was completed (required: a note,
   voice note, photo or video) and what is pending (optional; anything
   there becomes a follow-up task for the same person). Both land on the
   task's timeline and, for a site-linked task, the site timeline. */
export function CompleteTaskModal({ kind, id, title, forUserId = null, onClose, onCompleted }) {
  const tr = useT();
  const [completed, setCompleted] = useState(emptySection);
  const [pending, setPending] = useState(emptySection);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (isSectionEmpty(completed)) {
      setError(tr("completedRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await postTaskComplete(kind, id, { completed, pending }, { forUserId });
      [...completed.files, ...pending.files].forEach((f) => URL.revokeObjectURL(f.url));
      if (result?.followup) window.alert(tr("followupCreated"));
      onCompleted?.(result);
    } catch (err) {
      console.error("[sbm] failed to complete task", err);
      setError(err.message || tr("failedTryAgain"));
      setSaving(false);
    }
  };

  const sectionLabel = { fontSize: 14, fontWeight: 600, color: t.edge };
  const hint = { fontSize: 12, color: t.edge2, margin: "-4px 0 0" };

  return (
    <Modal label={tr("markDone")} title={tr("markDone")} onClose={saving ? undefined : onClose} width={520} scroll>
      {title && <div style={{ fontSize: 14, color: t.edge2, marginTop: -4 }}>{title}</div>}

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={sectionLabel}>{tr("whatCompleted")} *</span>
        <p style={hint}>{tr("completedRequired")}</p>
        <UpdateComposer value={completed} onChange={setCompleted} disabled={saving} autoFocus />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${t.frost}`, paddingTop: 12 }}>
        <span style={sectionLabel}>{tr("whatPending")}</span>
        <p style={hint}>{tr("pendingHint")}</p>
        <UpdateComposer value={pending} onChange={setPending} disabled={saving} />
      </section>

      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={saving} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
          {tr("cancel")}
        </button>
        <button type="button" onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, opacity: saving ? 0.6 : 1 }}>
          {saving ? tr("saving") : tr("markDone")}
        </button>
      </div>
    </Modal>
  );
}
