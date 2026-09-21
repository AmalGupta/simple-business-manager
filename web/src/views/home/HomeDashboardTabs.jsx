/* Calls-style bookmark tabs for admin home (Admin + staff with open todos). */

const HOME_TABS_CSS = `
.sbm-home-dash-tabs {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-line);
  margin-bottom: 1rem;
}
.sbm-home-dash-tab {
  appearance: none;
  border: 1px solid transparent;
  border-bottom: none;
  background: transparent;
  margin: 0 0 -1px;
  padding: 10px 16px;
  font-family: var(--font-label), system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-slate);
  cursor: pointer;
}
.sbm-home-dash-tab[aria-selected="true"] {
  background: var(--color-surface);
  border-color: var(--color-line);
  color: var(--color-ink);
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}
`;

export function HomeDashboardTabs({ homeTab, staffTabs, onSelect }) {
  return (
    <>
      <style>{HOME_TABS_CSS}</style>
      <div className="sbm-home-dash-tabs" role="tablist" aria-label="Dashboard views">
        <button
          type="button"
          role="tab"
          className="sbm-home-dash-tab"
          aria-selected={homeTab === "admin"}
          onClick={() => onSelect("admin")}
        >
          Admin
        </button>
        {staffTabs.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className="sbm-home-dash-tab"
            aria-selected={homeTab === s.id}
            onClick={() => onSelect(s.id)}
          >
            {s.name}
            {s.open_todo_count > 0 ? ` (${s.open_todo_count})` : ""}
          </button>
        ))}
      </div>
    </>
  );
}
