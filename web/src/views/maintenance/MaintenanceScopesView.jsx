import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE } from "../../styles.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import {
  deleteScopeRoleGrant,
  deleteScopeUserOverride,
  fetchScopes,
  putScopeRoleGrant,
  putScopeUserOverride,
} from "../../lib/api.js";

/* SBM-81 — Maintenance → Manage scopes. What an admin/superadmin may do while
   viewing a staff member's dashboard. Level per component, per role, with an
   optional per-user override. "default" = no row stored (registry default). */

const LEVELS = [
  { key: "none", label: "Hidden" },
  { key: "read", label: "View only" },
  { key: "write", label: "Can act" },
];
const DEFAULT = "__default";

function LevelSelect({ value, isDefault, defaultLevel, onChange, label, disabled }) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      value={isDefault ? DEFAULT : value}
      onChange={(e) => onChange(e.target.value === DEFAULT ? null : e.target.value)}
      style={{ ...TEXT_INPUT_STYLE, minHeight: 44, width: "100%" }}
    >
      <option value={DEFAULT}>Default ({LEVELS.find((l) => l.key === defaultLevel)?.label ?? defaultLevel})</option>
      {LEVELS.map((l) => (
        <option key={l.key} value={l.key}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export function MaintenanceScopesView({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await fetchScopes());
      setError("");
    } catch (err) {
      setError(err.message || "Couldn’t load scopes");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message || "Couldn’t save");
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const out = new Map();
    for (const d of data?.registry ?? []) {
      if (!out.has(d.group)) out.set(d.group, []);
      out.get(d.group).push(d);
    }
    return [...out.entries()];
  }, [data]);

  const grant = (role, key) => data?.role_grants.find((g) => g.role === role && g.scope_key === key)?.level ?? null;
  const override = (uid, key) => data?.user_overrides.find((o) => o.user_id === uid && o.scope_key === key)?.level ?? null;

  const setRole = (role, key, level) =>
    run(() => (level ? putScopeRoleGrant(role, key, level) : deleteScopeRoleGrant(role, key)));
  const setUser = (key, level) =>
    run(() => (level ? putScopeUserOverride(userId, key, level) : deleteScopeUserOverride(userId, key)));

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0.5rem 0" }}>Manage scopes</h1>
      <p style={{ fontSize: 14, color: t.edge2, marginTop: 0, maxWidth: 640 }}>
        What an admin can see and do while viewing a staff member’s dashboard. An admin’s own dashboard is never
        affected. A user override beats the role setting. Hiding a page hides its actions too.
      </p>
      {error && <p style={{ color: t.signal, fontSize: 14 }}>{error}</p>}
      {!data ? (
        !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <TileLabel>Per-user override</TileLabel>
            <select
              aria-label="Choose a user to override"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44, width: "100%", maxWidth: 360 }}
            >
              <option value="">No user selected</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </Card>

          {groups.map(([group, defs]) => (
            <Card key={group} style={{ marginBottom: 16 }}>
              <TileLabel>{group}</TileLabel>
              {defs.map((d) => (
                <div
                  key={d.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 8,
                    alignItems: "end",
                    padding: "10px 0",
                    borderTop: `1px solid ${t.frost}`,
                  }}
                >
                  <div style={{ gridColumn: "1 / -1", fontSize: 14, fontWeight: 600 }}>
                    {d.label}
                    <span style={{ fontWeight: 400, color: t.edge2 }}> · {d.kind}</span>
                  </div>
                  {data.roles.map((role) => (
                    <label key={role} style={{ fontSize: 12, color: t.edge2 }}>
                      {role}
                      <LevelSelect
                        label={`${d.label} — ${role}`}
                        disabled={busy}
                        value={grant(role, d.key)}
                        isDefault={grant(role, d.key) == null}
                        defaultLevel={data.default_level}
                        onChange={(level) => setRole(role, d.key, level)}
                      />
                    </label>
                  ))}
                  {userId && (
                    <label style={{ fontSize: 12, color: t.edge2 }}>
                      {data.users.find((u) => u.id === userId)?.name} (override)
                      <LevelSelect
                        label={`${d.label} — user override`}
                        disabled={busy}
                        value={override(userId, d.key)}
                        isDefault={override(userId, d.key) == null}
                        defaultLevel="role setting"
                        onChange={(level) => setUser(d.key, level)}
                      />
                    </label>
                  )}
                </div>
              ))}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
