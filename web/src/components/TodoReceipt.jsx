import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCheck, Info } from "lucide-react";
import { t } from "../theme.js";
import { Modal } from "./Modal.jsx";
import { useShowTodoReceipt } from "../lib/todoPermissions.jsx";
import { fmtDateTime } from "../views/work/workDates.js";

/* ------------------------------------------------------------------
   WhatsApp-style read receipts on an assigned todo (migration 0055).
   - Grey double tick: the assignment is saved (todo_assignees row —
     "delivered").
   - Blue double tick: every assignee has seen it on their own Assigned
     work screen (todo_assignees.seen_at).
   Right-click the row → Info, or tap the ticks (no right-click on touch),
   opens the per-assignee delivered / seen times.
   ------------------------------------------------------------------ */

function allSeen(todo) {
  const list = todo?.assignees ?? [];
  return list.length > 0 && list.every((a) => a.seen_at);
}

function ReadTicks({ seen, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={seen ? "Seen — show info" : "Delivered — show info"}
      title={seen ? "Seen" : "Delivered"}
      style={{
        alignSelf: "flex-end",
        display: "inline-flex",
        alignItems: "center",
        padding: 2,
        margin: "0 -2px -2px 0",
        border: "none",
        background: "none",
        cursor: "pointer",
        color: seen ? t.accent : t.edge2,
        flexShrink: 0,
      }}
    >
      <CheckCheck size={14} strokeWidth={2.25} />
    </button>
  );
}

function ContextMenu({ x, y, onInfo, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 150);
  const top = Math.min(y, window.innerHeight - 50);
  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 110,
        minWidth: 140,
        padding: 4,
        background: t.white,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusButton,
        boxShadow: "0 6px 20px rgba(20,24,31,0.14)",
      }}
    >
      <button
        type="button"
        role="menuitem"
        autoFocus
        onClick={onInfo}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 10px",
          border: "none",
          background: "none",
          fontSize: 13,
          color: t.edge,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <Info size={14} /> Info
      </button>
    </div>
  );
}

function ReceiptLine({ seen, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <CheckCheck size={14} strokeWidth={2.25} color={seen ? t.accent : t.edge2} style={{ flexShrink: 0 }} />
      <span style={{ color: t.edge2, minWidth: 64 }}>{label}</span>
      <span style={{ color: t.edge, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function TodoInfoDialog({ todo, onClose }) {
  const assignees = todo.assignees ?? [];
  return (
    <Modal label="Todo info" title="Todo info" onClose={onClose} width={400} scroll>
      <p style={{ fontSize: 13, color: t.edge2, margin: 0, lineHeight: 1.5 }}>{todo.text}</p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {assignees.map((a) => (
          <div
            key={a.id}
            style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 0", borderTop: `1px solid ${t.frost}` }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: t.edge }}>{a.name}</span>
            <ReceiptLine label="Delivered" value={fmtDateTime(a.assigned_at) || "—"} />
            <ReceiptLine seen={Boolean(a.seen_at)} label="Seen" value={a.seen_at ? fmtDateTime(a.seen_at) : "Not seen yet"} />
            {a.assigned_by_name ? (
              <span style={{ fontSize: 12, color: t.edge2 }}>Assigned by {a.assigned_by_name}</span>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            minHeight: 36,
            padding: "0 14px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

/** A todo block (div) with the receipt wired in: right-click → Info, and
 *  the ticks on a closing right-aligned line — bottom-right of the block
 *  whether it lays out as a flex column or plain block. */
export function TodoReceiptArea({ todo, className, style, children }) {
  const { ticks, onContextMenu, overlay } = useTodoReceipt(todo);
  return (
    <div className={className} style={style} onContextMenu={onContextMenu}>
      {children}
      {ticks ? <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6 }}>{ticks}</div> : null}
      {overlay}
    </div>
  );
}

/**
 * `{ ticks, onContextMenu, overlay }` for one todo row. All three are null
 * unless the viewer is an admin and the todo is routed to someone — spread
 * `onContextMenu` on the row element, place `ticks` at its bottom-right,
 * and render `overlay` anywhere inside it.
 */
export function useTodoReceipt(todo) {
  const show = useShowTodoReceipt(todo);
  const [menu, setMenu] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  if (!show) return { ticks: null, onContextMenu: undefined, overlay: null };

  const onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };
  /* Portaled: rows sit inside animated carousel cards, and a transformed
     ancestor would trap position:fixed. React events still bubble through
     portals, so the wrapper keeps clicks from reaching the row. */
  const overlay = !menu && !infoOpen ? null : createPortal(
    <div onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onInfo={() => {
            setMenu(null);
            setInfoOpen(true);
          }}
        />
      ) : null}
      {infoOpen ? <TodoInfoDialog todo={todo} onClose={() => setInfoOpen(false)} /> : null}
    </div>,
    document.body
  );
  return { ticks: <ReadTicks seen={allSeen(todo)} onClick={() => setInfoOpen(true)} />, onContextMenu, overlay };
}
