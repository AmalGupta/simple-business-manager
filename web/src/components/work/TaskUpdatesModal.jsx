import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { fetchTaskUpdates, postTaskUpdate, postTaskUpdatesSeen } from "../../lib/api.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../Modal.jsx";
import { TaskUpdateContent } from "./TaskUpdateContent.jsx";
import { UpdateComposer, emptySection, isSectionEmpty } from "./UpdateComposer.jsx";
import { fmtDateTime } from "../../views/work/workDates.js";
import { describeTransition } from "../../views/work/taskAuditFormat.js";
import { TaskContacts, taskContacts } from "../../views/work/TaskContacts.jsx";
import { useT } from "../../lib/i18n.jsx";

const STATUS_LABEL = { open: "Open", done: "Done", snoozed: "Parked", assigned: "Open", unassigned: "Unassigned" };

/* SBM-103 — one task's timeline as a popup: its header, a composer to add
   an update (note / voice / photo / video), and every post and state change
   newest first. Opening it clears the item's green bubble for the viewer.
   Used from staff Assigned work (Share update), the admin Open tasks
   updates list, and Task audit. */
export function TaskUpdatesModal({ kind, id, onClose, onChanged, onOpenCall, onOpenSite, canPost = true }) {
  const tr = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(emptySection);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const load = useCallback(
    () =>
      fetchTaskUpdates(kind, id)
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((err) => {
          console.error("[sbm] failed to load task updates", err);
          setError(tr("couldntLoadUpdates"));
        }),
    [kind, id, tr]
  );

  useEffect(() => {
    load();
    postTaskUpdatesSeen(kind, id)
      .then(() => onChanged?.())
      .catch((err) => console.error("[sbm] failed to mark task updates seen", err));
    // onChanged is a parent refresh; only re-run when the task itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, load]);

  const feed = useMemo(() => {
    if (!data) return [];
    const posts = (data.updates ?? []).map((u) => ({ type: "post", at: u.created_at, u }));
    const events = (data.task?.events ?? []).map((e) => ({ type: "event", at: e.created_at, e }));
    const ts = (s) => (String(s).includes("T") ? Date.parse(s) : Date.parse(`${String(s).replace(" ", "T")}Z`)) || 0;
    return [...posts, ...events].sort((a, b) => ts(b.at) - ts(a.at));
  }, [data]);

  const send = async () => {
    if (isSectionEmpty(draft)) {
      setSendError(tr("addSomething"));
      return;
    }
    setSending(true);
    setSendError("");
    try {
      await postTaskUpdate(kind, id, draft);
      draft.files.forEach((f) => URL.revokeObjectURL(f.url));
      setDraft(emptySection());
      await load();
      onChanged?.();
    } catch (err) {
      console.error("[sbm] failed to post task update", err);
      setSendError(err.message || tr("failedTryAgain"));
    } finally {
      setSending(false);
    }
  };

  const task = data?.task;
  return (
    <Modal label={tr("updates")} onClose={onClose} width={560} scroll>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>{task?.title ?? tr("updates")}</div>
          {task && (
            <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
              {STATUS_LABEL[task.status] ?? task.status ?? ""}
              {task.urgent ? " · urgent" : ""}
              {task.assignees?.length ? ` · ${task.assignees.join(", ")}` : ""}
              {task.site_name ? ` · ${task.site_name}` : ""}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32 }}>
          {tr("close")}
        </button>
      </div>

      {task && <TaskContacts contacts={taskContacts(task)} style={{ fontSize: 12 }} />}
      {task && (onOpenCall || onOpenSite) && (task.call_id || task.site_name) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {task.call_id && onOpenCall && (
            <button type="button" onClick={() => onOpenCall(task.call_id)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32 }}>
              Open call
            </button>
          )}
          {task.site_name && onOpenSite && (
            <button type="button" onClick={() => onOpenSite(task.site_name)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32 }}>
              Open site
            </button>
          )}
        </div>
      )}

      {canPost && (
        <div style={{ borderTop: `1px solid ${t.frost}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.edge }}>{tr("shareUpdate")}</span>
          <UpdateComposer value={draft} onChange={setDraft} disabled={sending} />
          {sendError && <span style={{ fontSize: 12, color: t.signal }}>{sendError}</span>}
          <button type="button" onClick={send} disabled={sending} style={{ ...PRIMARY_BUTTON_STYLE, alignSelf: "flex-end", opacity: sending ? 0.6 : 1 }}>
            {sending ? tr("sending") : tr("send")}
          </button>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${t.frost}`, paddingTop: 12 }}>
        {error && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>{error}</p>}
        {!data && !error && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>{tr("loading")}</p>}
        {data && feed.length === 0 && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>{tr("noUpdatesYet")}</p>}
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {feed.map((row, i) => (
            <li
              key={row.type === "post" ? `p-${row.u.id}` : `e-${row.e.id}`}
              style={{
                position: "relative",
                padding: "0 0 14px 18px",
                borderLeft: i === feed.length - 1 ? "2px solid transparent" : `2px solid ${t.frost}`,
                marginLeft: 5,
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: -6,
                  top: 2,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: row.type === "post" ? t.unread : row.e.event === "marked_urgent" ? t.signal : t.accent,
                }}
              />
              {row.type === "post" ? (
                <>
                  <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>
                    {row.u.author_name ?? "—"} · {fmtDateTime(row.u.created_at)}
                    {row.u.followup_kind === kind && row.u.followup_id === id ? ` · ${tr("fromEarlierTask")}` : ""}
                  </div>
                  <TaskUpdateContent section={row.u.section} body={row.u.body} media={row.u.media} />
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.edge }}>{describeTransition(row.e)}</div>
                  <div style={{ fontSize: 12, color: t.edge2, marginTop: 1 }}>
                    {row.e.actor_name ?? "System"} · {fmtDateTime(row.e.created_at)}
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
