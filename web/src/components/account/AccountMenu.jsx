import { useState, useEffect, useRef } from "react";
import { User, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { t } from "../../theme.js";
import { ResetPinModal } from "./ResetPinModal.jsx";
import { UpdatePhoneModal } from "./UpdatePhoneModal.jsx";
import { patchMyCustomization } from "../../lib/api.js";

/* Account menu — top-right "my account" in the blue header.
   Update phone, then (admin/superadmin) Settings → Site customization
   with Vertical / Horizontal scroll toggles, then Reset PIN / Log out. */
export function AccountMenu({
  me,
  onLogout,
  onResetPin,
  onUpdatePhone,
  customization,
  onCustomizationChange,
  onRequestReport,
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState("root"); // root | settings | site-customization
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [values, setValues] = useState(() => ({
    inner_scrolls: customization?.inner_scrolls ?? false,
    horizontal_scrolls: customization?.horizontal_scrolls ?? false,
  }));
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  const canCustomize = me?.role === "admin" || me?.role === "superadmin";

  useEffect(() => {
    setValues({
      inner_scrolls: customization?.inner_scrolls ?? false,
      horizontal_scrolls: customization?.horizontal_scrolls ?? false,
    });
  }, [customization?.inner_scrolls, customization?.horizontal_scrolls]);

  useEffect(() => {
    if (!open) {
      setPanel("root");
      setError("");
      return;
    }
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
    justifyContent: "space-between",
    gap: 8,
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

  const togglePref = async (key) => {
    if (!canCustomize) return;
    const next = !values[key];
    setBusyKey(key);
    setError("");
    setValues((v) => ({ ...v, [key]: next }));
    try {
      const data = await patchMyCustomization({ [key]: next });
      const resolved = data.customization ?? { ...values, [key]: next };
      setValues({
        inner_scrolls: resolved.inner_scrolls ?? false,
        horizontal_scrolls: resolved.horizontal_scrolls ?? false,
      });
      onCustomizationChange?.(resolved);
    } catch (err) {
      console.error("[sbm] failed to save customization", err);
      setValues((v) => ({ ...v, [key]: !next }));
      setError("Failed to save — try again.");
    } finally {
      setBusyKey(null);
    }
  };

  const renderRoot = () => (
    <>
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
      {onRequestReport && (
        <button
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onRequestReport();
          }}
          style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
        >
          Request / Report
        </button>
      )}
      {canCustomize && (
        <button
          role="menuitem"
          onClick={() => setPanel("settings")}
          style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
        >
          <span>Settings</span>
          <ChevronRight size={14} color={t.edge2} />
        </button>
      )}
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
    </>
  );

  const renderSettings = () => (
    <>
      <button role="menuitem" onClick={() => setPanel("root")} style={menuItemStyle}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ChevronLeft size={14} color={t.edge2} />
          Settings
        </span>
      </button>
      <button
        role="menuitem"
        onClick={() => setPanel("site-customization")}
        style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
      >
        <span>Site customization</span>
        <ChevronRight size={14} color={t.edge2} />
      </button>
    </>
  );

  const scrollToggle = (key, label) => (
    <label
      key={key}
      style={{
        ...menuItemStyle,
        borderTop: `1px solid ${t.frost}`,
        cursor: busyKey === key ? "wait" : "pointer",
        fontWeight: 500,
      }}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(values[key])}
        disabled={busyKey === key}
        onChange={() => togglePref(key)}
        aria-label={label}
        style={{ width: 16, height: 16, accentColor: "var(--color-accent)", flexShrink: 0 }}
      />
    </label>
  );

  const renderSiteCustomization = () => (
    <>
      <button role="menuitem" onClick={() => setPanel("settings")} style={menuItemStyle}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ChevronLeft size={14} color={t.edge2} />
          Site customization
        </span>
      </button>
      {error ? (
        <p style={{ margin: 0, padding: "6px 14px", fontSize: 12, color: t.signal }}>{error}</p>
      ) : null}
      {scrollToggle("inner_scrolls", "Vertical scroll")}
      {scrollToggle("horizontal_scrolls", "Horizontal scroll")}
    </>
  );

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
          aria-label={panel === "root" ? "Account" : panel === "settings" ? "Settings" : "Site customization"}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: panel === "site-customization" ? 220 : 180,
            background: t.white,
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            boxShadow: "0 8px 24px rgba(20,24,31,0.22)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          {panel === "root" && renderRoot()}
          {panel === "settings" && renderSettings()}
          {panel === "site-customization" && renderSiteCustomization()}
        </div>
      )}

      {showResetModal && <ResetPinModal onClose={() => setShowResetModal(false)} onReset={onResetPin} />}
      {showPhoneModal && (
        <UpdatePhoneModal currentPhone={me?.phone} onClose={() => setShowPhoneModal(false)} onSave={onUpdatePhone} />
      )}
    </div>
  );
}
