import { useEffect, useRef } from "react";
import { t } from "../theme.js";

/* ------------------------------------------------------------------
   Shared dialog shell.

   Nine dialogs grew independently with the same hand-copied recipe —
   fixed backdrop, rgba(20,24,31,0.5), zIndex 100, a stopPropagation
   panel — and none of them handled Escape or restored focus. This is
   that recipe, once, plus the two things every copy was missing.

   Deliberately not a portal: every dialog in this app already renders
   at the end of its view's tree with nothing overlapping, and the
   canvas/theme system has no stacking context that would clip it.

   `width` covers the two sizes in use: 360 for a prompt, 480 for the
   wide work-timeline popup. Pass `scroll` for content that can exceed
   the viewport.
   ------------------------------------------------------------------ */
export function Modal({ label, title, onClose, width = 360, scroll = false, children }) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog so Escape and tabbing land here rather
    // than on whatever button opened it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      // Only restore if focus is still inside the dialog — otherwise the
      // user has already clicked elsewhere and we'd be yanking it back.
      if (panelRef.current?.contains(document.activeElement)) {
        restoreFocusRef.current?.focus?.();
      }
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          outline: "none",
          ...(scroll ? { maxHeight: "85vh", overflowY: "auto" } : null),
        }}
      >
        {title && (
          <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>{title}</span>
        )}
        {children}
      </div>
    </div>
  );
}
