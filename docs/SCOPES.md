# View-as scopes (SBM-81)

An admin/superadmin who opens a staff member's bookmark tab on the admin home ("view-as") is **read-only by default**. Admin/superadmin can loosen or tighten that per component from **Account menu → Settings → Maintenance → Manage scopes**. An admin's own dashboard, and staff on their own dashboard, are never gated.

## Model
- Levels: `none` (hidden) · `read` (view only) · `write` (can act). Registry default is `read`.
- Keys live in code: `packages/core/src/scopes.ts` (`SCOPE_REGISTRY`). Add a key there to make a new component configurable; it ships as `read` with no migration.
- Resolution (`resolveScope`): per-user override → role grant → default. A page set to `none` also hides its child actions (`parent`); page `read` + action `write` is valid.
- Storage: `scope_role_grants` (role × key), `scope_user_overrides` (user × key) — migration `0057`. Missing row = default. Queries are in `packages/core/src/queries.ts`.

## Enforcement
- **Load time:** `GET /api/me` returns `scopes` (resolved map) for admin/superadmin. Client: `web/src/lib/scopes.jsx` (`useScope(key)`, `ScopeGate`).
- **Server:** the staff tab sends `X-SBM-View-As: <staffId>` on every `/api/*` request (installed in `web/src/lib/api.js`). `src/lib/scopes.ts` (`enforceViewAsScope`, called once in `src/index.ts`) maps method+path → scope key via `ROUTE_RULES` in core and returns `403 {error:"read_only"}`.
- Routes not listed in `ROUTE_RULES` are not gated. **Adding a write route a staff screen can reach? Add a rule.**
- This is a guardrail against accidental admin action from a staff screen, not a security boundary against an admin who deliberately omits the header; the admin's own privileges are unchanged.

## UI gating so far
Staff-home tiles (page scopes), `WorkCard` (done / schedule / pass on), `StaffLanguagePicker`, and a "View only" chip. Other staff-screen controls (site visit forms, complaint detail, call-task rows) are enforced server-side and will show an error on attempt; hide them with `useScope` as follow-up.

## Tests
`pnpm exec tsx --test packages/core/src/scopes.test.ts` · `pnpm exec playwright test --config=e2e/playwright.config.ts scopes.spec.ts`
