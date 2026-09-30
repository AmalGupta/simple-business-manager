import { useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, MapPin, MessageSquareWarning, Phone } from "lucide-react";
import { t } from "../../theme.js";
import { STAFF_HIDDEN_WORKFLOW_CATEGORIES } from "../../lib/constants.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { Card } from "../Card.jsx";
import { TodoContext } from "../TodoContext.jsx";
import { PassOnPicker } from "./PassOnPicker.jsx";
import { CarriedForwardLabel } from "../../views/work/CarriedForwardLabel.jsx";
import { urgentDeadline } from "../../views/work/workDates.js";
import { categoryLabel, fmtShortLang, fmtTimeLeftLang, stageLabel, useLang, useT } from "../../lib/i18n.jsx";
import { useTodoPermissions } from "../../lib/todoPermissions.jsx";
import { useScope } from "../../lib/scopes.jsx";

const tagStyle = {
  fontFamily: t.label,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge2,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

/* SBM-72 — one piece of assigned work as a metro card: what it is (call
   todo, site stage, or complaint), where (site link), when (urgent / due /
   planned), and the three things staff do with it — plan it onto a day,
   mark it done, or pass it on. Only an admin resolves a complaint, so staff
   see Pass on alone on those. Text follows the display language; the task
   text itself is shown as it was spoken. */
export function WorkCard({
  item,
  today,
  canAdmin,
  roster,
  selfId,
  busy,
  showSite = true,
  onSchedule,
  onDone,
  onHandOff,
  onOpenSite,
  onOpenCall,
  onOpenComplaint,
}) {
  const tr = useT();
  const lang = useLang();
  const [passing, setPassing] = useState(false);
  const [confirmingDone, setConfirmingDone] = useState(false);
  const { canComplete } = useTodoPermissions(item);
  /* SBM-81: an admin viewing this on a staff tab may be read-only. */
  const canAct = useScope("staff.assigned_work.act").canWrite;
  const canPass = useScope("staff.assigned_work.handoff").canWrite;
  const urgent = Boolean(item.urgent_at);
  const overdue = !urgent && item.scheduled_for && item.scheduled_for < today;
  const isComplaint = item.kind === "complaint";
  const isStage = item.kind === "site_task";
  /* SBM-68: staff see an Admin & Intake stage assigned to them, but not its category. */
  const showCategory = isStage && item.category && (canAdmin || !STAFF_HIDDEN_WORKFLOW_CATEGORIES.includes(item.category));
  const title = isStage ? stageLabel(lang, item.stage_id, item.title) : item.title;
  /* SBM-82: a todo still waiting to be routed can't be finished yet. */
  const canFinish = canAct && (isComplaint ? canAdmin : item.kind !== "todo" || canComplete);

  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "100%",
        boxSizing: "border-box",
        ...(urgent ? { borderColor: t.signal } : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
          {isComplaint && (
            <span style={{ ...tagStyle, color: t.putty }}>
              <MessageSquareWarning size={12} /> {tr("complaint")}
            </span>
          )}
          {showCategory && <span style={tagStyle}>{categoryLabel(lang, item.category)}</span>}
          {!isComplaint && item.work_location && <span style={tagStyle}>{categoryLabel(lang, item.work_location)}</span>}
        </span>
        {urgent && (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={13} /> {fmtTimeLeftLang(lang, urgentDeadline(item.urgent_at))}
          </span>
        )}
      </div>

      {isComplaint && onOpenComplaint ? (
        <button
          type="button"
          onClick={() => onOpenComplaint(item.id)}
          style={{ all: "unset", cursor: "pointer", fontSize: 15, fontWeight: 500, color: t.edge, lineHeight: 1.4 }}
        >
          {title}
        </button>
      ) : (
        <span style={{ fontSize: 15, fontWeight: 500, color: t.edge, lineHeight: 1.4 }}>
          {title}
          {item.kind === "todo" && <TodoContext text={item.context} />}
        </span>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
        {showSite && item.site_name && onOpenSite && (
          <button
            type="button"
            onClick={() => onOpenSite(item.site_name)}
            style={{ all: "unset", cursor: "pointer", color: t.accent, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <MapPin size={12} /> {item.site_name}
          </button>
        )}
        {item.call_id && onOpenCall && (
          <button
            type="button"
            onClick={() => onOpenCall(item.call_id)}
            style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Phone size={12} /> {tr("fromCallWith", { name: item.client_name ?? "—" })}
          </button>
        )}
        {item.due_date && !urgent && <span>{tr("due", { date: fmtShortLang(lang, item.due_date) })}</span>}
        {overdue && (
          <span style={{ color: t.putty, fontWeight: 700 }}>{tr("plannedNotDone", { date: fmtShortLang(lang, item.scheduled_for) })}</span>
        )}
        <CarriedForwardLabel item={item} />
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
        {urgent && !canAdmin ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal }}>{tr("urgentFinishToday")}</span>
        ) : (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.edge2 }}>
            {tr("planFor")}
            <input
              type="date"
              aria-label={tr("planForDate")}
              value={item.scheduled_for ?? ""}
              min={canAdmin ? undefined : today}
              disabled={busy || !canAct}
              onChange={(e) => onSchedule(item, e.target.value || null)}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44, flex: 1, minWidth: 0 }}
            />
          </label>
        )}
        <div style={{ display: "grid", gridTemplateColumns: canFinish && canPass ? "1fr 1fr" : "1fr", gap: 8 }}>
          {canFinish && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDone(true)}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Check size={14} /> {isComplaint ? tr("resolve") : tr("done")}
            </button>
          )}
          {canPass && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setPassing((p) => !p)}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <ArrowRightLeft size={14} /> {tr("passOn")}
          </button>
          )}
        </div>
        {confirmingDone && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: t.edge, flex: "1 1 auto" }}>{tr("confirmMarkDone")}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmingDone(false);
                onDone(item);
              }}
              style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44 }}
            >
              {tr("yesDone")}
            </button>
            <button type="button" onClick={() => setConfirmingDone(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
              {tr("cancel")}
            </button>
          </div>
        )}
        {passing && (
          <PassOnPicker
            roster={roster}
            selfId={selfId}
            busy={busy}
            onCancel={() => setPassing(false)}
            onPick={async (to) => {
              await onHandOff(item, to);
              setPassing(false);
            }}
          />
        )}
      </div>
    </Card>
  );
}
