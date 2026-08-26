import { t } from "../theme.js";

/* Site chips for internal calls, client name for client calls — the
   organising unit in speech is the site, not the client, for the 9-of-11
   internal-ops majority. Falls back to client_name for legacy rows
   recorded before call_type existed. See docs/ADDITIONAL_FEATURES_M0.md. */
export function CallHeading({ call }) {
  const showSites = call.call_type === "internal" && call.sites?.length > 0;
  if (!showSites) {
    return (
      <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
        {call.client_name}
      </span>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {call.sites.map((site) => (
        <span
          key={site}
          style={{
            fontFamily: t.display,
            fontSize: 14,
            fontWeight: 500,
            padding: "3px 9px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radius,
            color: t.edge,
          }}
        >
          {site}
        </span>
      ))}
    </div>
  );
}
