/* Mirrors SELECTABLE_CALLER_CATEGORIES / CALLER_CATEGORY_LABELS in
   packages/core/src/caller-category.ts. Spam is set via Mark as spam, not picked. */
export const CALLER_TYPE_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "supplier", label: "Supplier" },
  { value: "transporter", label: "Transporter" },
  { value: "office_staff", label: "Office Staff" },
  { value: "service_staff", label: "Service Staff" },
  { value: "family", label: "Family" },
  { value: "relative", label: "Relative" },
  { value: "franchisee", label: "Franchisee" },
  { value: "sales_associate", label: "Sales Associate" },
  { value: "brand_associate", label: "Brand Associate" },
  { value: "builder_project", label: "Builder / Project" },
  { value: "architect", label: "Architect" },
];

export function isStaffCategory(category) {
  return category === "office_staff" || category === "service_staff";
}

/** Display label for any stored category (spam included). */
export function callerCategoryLabel(category) {
  if (category === "spam") return "Spam";
  return CALLER_TYPE_OPTIONS.find((o) => o.value === category)?.label ?? category ?? "";
}
