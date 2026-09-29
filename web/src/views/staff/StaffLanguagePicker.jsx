import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE } from "../../styles.js";
import { fetchStaffLanguage, patchStaffLanguage } from "../../lib/api.js";
import { LANGUAGES } from "../../lib/i18n.jsx";

/* SBM-72 — admin, on a staff member's tab of the admin home: the language
   that person's screens are shown in. Hindi by default; saved on change. */
export function StaffLanguagePicker({ staffId, staffName }) {
  const [lang, setLang] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLang(null);
    setStatus("");
    fetchStaffLanguage(staffId)
      .then((r) => !cancelled && setLang(r.display_language))
      .catch((err) => {
        console.error("[sbm] failed to load staff language", err);
        if (!cancelled) setLang("hi");
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const change = async (next) => {
    const prev = lang;
    setLang(next);
    setStatus("Saving…");
    try {
      await patchStaffLanguage(staffId, next);
      setStatus("Saved");
    } catch (err) {
      console.error("[sbm] failed to save staff language", err);
      setLang(prev);
      setStatus("Couldn’t save — try again");
    }
  };

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: t.edge2, marginBottom: "1rem" }}>
      <Languages size={15} />
      Display language{staffName ? ` for ${staffName}` : ""}
      <select
        value={lang ?? ""}
        disabled={lang === null}
        onChange={(e) => change(e.target.value)}
        style={{ ...TEXT_INPUT_STYLE, minHeight: 40 }}
        aria-label={`Display language${staffName ? ` for ${staffName}` : ""}`}
      >
        {lang === null && <option value="">…</option>}
        {LANGUAGES.map((l) => (
          <option key={l.key} value={l.key}>
            {l.label}
          </option>
        ))}
      </select>
      {status && <span style={{ fontSize: 12 }}>{status}</span>}
    </label>
  );
}
