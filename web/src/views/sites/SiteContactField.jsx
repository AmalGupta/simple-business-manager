import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { useT } from "../../lib/i18n.jsx";

/* ------------------------------------------------------------------
   SBM-83 — a site field that names one Callers Directory contact
   (Assigned by / Referred by). No free text: the value is picked through
   AssociateContactsModal in `pick` mode, which the parent renders — the
   details dialog swaps to the picker rather than stacking a second Modal,
   since Escape closes every open one.

   `value` = `{ caller_id, name, phone }`. A legacy row with only text
   (no caller_id) shows that text with a prompt to pick a real contact.
   ------------------------------------------------------------------ */

export function siteContactValue(site, prefix) {
  const name = site?.[prefix]?.trim() || "";
  const callerId = site?.[`${prefix}_caller_id`] || null;
  if (!name && !callerId) return null;
  return { caller_id: callerId, name, phone: site?.[`${prefix}_phone`] || null };
}

export function SiteContactField({ value, placeholder, onChoose, onClear }) {
  const tr = useT();
  const linked = Boolean(value?.caller_id);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <button
        type="button"
        onClick={onChoose}
        style={{
          ...TEXT_INPUT_STYLE,
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {value ? (
          <>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.name}</span>
            <span
              style={{
                fontSize: 12,
                color: linked ? t.edge2 : t.putty,
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {linked ? value.phone || "" : tr("contactNotLinked")}
            </span>
          </>
        ) : (
          <span style={{ color: t.edge2 }}>{placeholder || tr("chooseContact")}</span>
        )}
      </button>
      {value ? (
        <button type="button" onClick={onClear} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {tr("clearContact")}
        </button>
      ) : (
        <button type="button" onClick={onChoose} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {tr("chooseContact")}
        </button>
      )}
    </div>
  );
}
