import { useState, useEffect, useRef } from "react";
import { User, ChevronDown } from "lucide-react";
import { t } from "../../theme.js";
import { ResetPinModal } from "./ResetPinModal.jsx";
import { UpdatePhoneModal } from "./UpdatePhoneModal.jsx";

/* Account menu — standard top-right "my account" pattern, in the blue
   header. Tap the name to open a small dropdown (Update phone, Reset PIN,
   Log out); click-outside or Escape closes it. Reset PIN opens the same
   ResetPinModal used before, just triggered from here now. */
export function AccountMenu({ me, onLogout, onResetPin, onUpdatePhone }) {
  const [open, setOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "10px 14px",
    border: "none",
    background: "none",
    color: t.edge,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: t.body,
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          border: "none",
          borderRadius: t.radiusButton,
          background: open ? "rgba(255,255,255,0.16)" : "none",
          color: t.white,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: t.body,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <User size={14} />
        {me?.name}
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 170,
            background: t.white,
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            boxShadow: "0 8px 24px rgba(20,24,31,0.22)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowPhoneModal(true);
            }}
            style={menuItemStyle}
          >
            Update phone
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowResetModal(true);
            }}
            style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
          >
            Reset PIN
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
          >
            Log out
          </button>
        </div>
      )}

      {showResetModal && <ResetPinModal onClose={() => setShowResetModal(false)} onReset={onResetPin} />}
      {showPhoneModal && (
        <UpdatePhoneModal currentPhone={me?.phone} onClose={() => setShowPhoneModal(false)} onSave={onUpdatePhone} />
      )}
    </div>
  );
}
