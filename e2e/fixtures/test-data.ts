// Shared identity for the admin account global-setup seeds via
// POST /api/admin/users. One fixed account is enough for this suite — see
// global-setup.ts for how it's created (idempotent: a second run reuses it).
export const TEST_ADMIN = {
  name: "E2E Admin",
  pin: "482913",
  role: "admin" as const,
};
