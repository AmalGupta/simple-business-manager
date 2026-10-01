import { useEffect, useState } from "react";
import { t } from "../../theme.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { useT } from "../../lib/i18n.jsx";
import { fetchAdminHandoffTargets } from "../../lib/api.js";

/* One fetch per page load — the admin list barely changes, and every open
   picker on Assigned work would otherwise ask again. A failure is dropped
   so the next picker retries. */
let adminsPromise = null;
function loadAdmins() {
  if (!adminsPromise) {
    adminsPromise = fetchAdminHandoffTargets().catch((err) => {
      console.error("[sbm] failed to load admins for pass on", err);
      adminsPromise = null;
      return [];
    });
  }
  return adminsPromise;
}

/* Pick a teammate to hand a piece of work to. Shared by the Assigned work
   cards and the complaint page (where an admin gets "Route to…" wording).
   `includeAdmins` (SBM-98) lists admins/superadmins first, so staff can pass
   work back up; off when an admin is routing to staff. */
export function PassOnPicker({ roster, selfId, busy, onPick, onCancel, placeholder, actionLabel, includeAdmins = true }) {
  const tr = useT();
  const [to, setTo] = useState("");
  const [admins, setAdmins] = useState([]);

  useEffect(() => {
    if (!includeAdmins) return undefined;
    let live = true;
    loadAdmins().then((rows) => {
      if (live) setAdmins(rows);
    });
    return () => {
      live = false;
    };
  }, [includeAdmins]);

  const options = roster.filter((s) => s.id !== selfId);
  const adminOptions = includeAdmins ? admins.filter((a) => a.id !== selfId) : [];
  const prompt = placeholder ?? tr("passOnTo");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
      <select
        aria-label={prompt}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ ...TEXT_INPUT_STYLE, gridColumn: "1 / -1", minHeight: 44 }}
      >
        <option value="">{prompt}</option>
        {adminOptions.length > 0 ? (
          <>
            <optgroup label={tr("passOnBackToAdmin")}>
              {adminOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={tr("passOnStaff")}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </>
        ) : (
          options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))
        )}
      </select>
      <button
        type="button"
        disabled={!to || busy}
        onClick={() => onPick(to)}
        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, background: t.accent, color: t.white, border: "none", opacity: !to || busy ? 0.5 : 1 }}
      >
        {actionLabel ?? tr("passOn")}
      </button>
      <button type="button" onClick={onCancel} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
        {tr("cancel")}
      </button>
    </div>
  );
}
