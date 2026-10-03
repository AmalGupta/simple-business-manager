/* SBM-106 — the views an admin can put on a "My page", and the screen each one
   opens. Ids must match MY_PAGE_VIEWS in packages/core/src/my-pages.ts. Keep
   the section groupings in step with the admin nav. */
export const MY_PAGE_VIEW_TARGETS = {
  "open-tasks": { name: "open-todos" },
  "task-audit": { name: "task-audit" },
  "calls-needing-action": { name: "calls-needing-action" },
  "resolved-calls": { name: "resolved-calls" },
  "complaints-open": { name: "complaints-home" },
  "staff-roster": { name: "staff-roster" },
  "staff-list": { name: "staff-hub" },
  offboarding: { name: "offboarding-list" },
  "staff-directory": { name: "staff-directory" },
  "sites-attention": { name: "sites-review" },
  "sites-directory": { name: "sites-directory" },
  "material-shortages": { name: "material-shortages" },
  "calls-logged": { name: "calls" },
  callers: { name: "callers-directory" },
};

export const MY_PAGE_SECTIONS = [
  { key: "work", label: "Work", views: ["open-tasks", "task-audit", "calls-needing-action", "resolved-calls"] },
  { key: "complaints", label: "Complaints", views: ["complaints-open"] },
  { key: "staff", label: "Staff", views: ["staff-roster", "staff-list", "offboarding", "staff-directory"] },
  { key: "sites", label: "Sites", views: ["sites-attention", "sites-directory", "material-shortages"] },
  { key: "calls", label: "Calls & contacts", views: ["calls-logged", "callers"] },
];

export const MY_PAGE_VIEW_LABELS = {
  "open-tasks": "Open tasks",
  "task-audit": "Task audit",
  "calls-needing-action": "Calls needing action",
  "resolved-calls": "Resolved calls",
  "complaints-open": "Complaints",
  "staff-roster": "Roster",
  "staff-list": "Staff list",
  offboarding: "Offboarding",
  "staff-directory": "Staff directory",
  "sites-attention": "Needing attention",
  "sites-directory": "Directory",
  "material-shortages": "Material shortages",
  "calls-logged": "Calls logged",
  callers: "Contacts (callers)",
};
