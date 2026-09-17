import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

/** Idempotent — safe to import from every grid view. */
ModuleRegistry.registerModules([AllCommunityModule]);
