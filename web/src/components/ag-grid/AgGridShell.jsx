import { AgGridReact } from "ag-grid-react";
import "./registerAgGrid.js";
import "./AgGridShell.css";

/**
 * Shared AG Grid host. Display height is an application attribute:
 * Site customization → `inner_scrolls` / `horizontal_scrolls`, mirrored on
 * the Dashboard shell as `data-inner-scrolls` / `data-horizontal-scrolls`.
 *
 * Pass the same `innerScrolls` boolean Dashboard already threads into views.
 * Do not set container height in the calling view.
 */
export function AgGridShell({
  innerScrolls = false,
  className = "",
  style,
  clickableRows = false,
  children,
  ...gridProps
}) {
  const domLayout = innerScrolls ? "normal" : "autoHeight";
  const classes = ["sbm-ag-grid", "ag-theme-quartz", className].filter(Boolean).join(" ");

  return (
    <div className="sbm-ag-grid-wrap" style={style}>
      <div className={classes} data-clickable-rows={clickableRows ? "1" : undefined}>
        {children ?? (
          <AgGridReact
            animateRows={false}
            suppressCellFocus
            domLayout={domLayout}
            defaultColDef={{ sortable: true, resizable: true, filter: true }}
            {...gridProps}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Full-page column around a directory grid. When `innerScrolls` is on,
 * claims Dashboard's fillViewport flex height so AgGridShell's
 * height:100% resolves (without this the grid collapses to ~0px).
 */
export function AgGridPage({ innerScrolls = false, className = "", style, children }) {
  return (
    <div
      className={["sbm-ag-grid-page", className].filter(Boolean).join(" ")}
      data-fill={innerScrolls ? "1" : "0"}
      style={style}
    >
      {children}
    </div>
  );
}
