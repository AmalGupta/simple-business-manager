# Domain plan — simple-business-manager.com

Plan only, nothing configured. Extends `docs/UAT_ENVIRONMENT_PLAN.md` and
`docs/MULTI_TENANCY_PLAN.md` (environment-per-tenant) with where each
environment actually lives once you own this domain.

## The scheme

One subdomain per tenant environment, all under the domain you're buying —
mirrors the `env.<slug>` / `sbm-pipeline-<slug>` naming already established,
just giving each one a real hostname instead of the `*.workers.dev`
fallback:

| Environment | Subdomain | Worker env |
|---|---|---|
| Current business (first tenant) | `jainglass.simple-business-manager.com` | a new `env.jainglass` block — see "What happens to the current deployment" below |
| Relai World | `relai-world.simple-business-manager.com` | `env.relai-world` |
| next tenant | `<slug>.simple-business-manager.com` | `env.<slug>` |
| UAT | *(no subdomain needed — see below)* | `env.uat` |
| Local dev | *(no domain — localhost only)* | unnamed/default env |

`*.workers.dev` stays live for every environment regardless
(`workers_dev: true` is already set at the top level and inherited) — the
custom domain is additive, not a replacement. Useful as a fallback if DNS or
the custom domain ever has an issue.

### UAT doesn't need a subdomain

UAT is internal testing against the current business's own historical data,
not something any tenant or their staff ever opens. Keep it on
`sbm-pipeline-uat.<account>.workers.dev` — burning a subdomain on it adds a
DNS record for a URL nobody needs to remember or bookmark. Revisit only if
UAT starts being used to demo the product to a *prospective* tenant before
they're onboarded, at which point a real subdomain earns its keep.

## What happens to the current deployment

Two things are colliding here that are worth resolving explicitly:

1. `wrangler.jsonc` already has a **commented-out, never-activated** route
   for `sbm-pipeline.jainglass.dev` — a *different* domain, planned before
   `simple-business-manager.com` was decided on. Since that route was never
   turned on (the comment says the zone was never added to the account),
   there's nothing live to migrate away from — it can simply be deleted
   once the new domain is set up, not "cut over."
2. The current deployment (`sbm-pipeline`, top-level config, no `env` block)
   is today's *only* tenant, but isn't yet structured as one under
   `docs/MULTI_TENANCY_PLAN.md`'s model. Bringing it under the new domain
   scheme means giving it the same treatment as Relai World: its own
   `env.jainglass` (or whatever slug you want — `sbm`, `jain-glass`,
   whatever reads best) block, its own subdomain, so every tenant — including
   the first one — is handled uniformly rather than the original deployment
   being a permanent special case with no `env` block at all.

This can happen whenever you want — it's a rename/restructure of the
existing single deployment into the same `env.<slug>` shape every future
tenant gets, not a data migration (same D1 database, same R2 buckets, same
data — just adding an `env` block around it and a custom domain route).

## The apex domain (`simple-business-manager.com` itself)

Not decided yet — flagging so it's a conscious choice, not an accident of
whatever Cloudflare defaults to once the zone is active. Real options:

- **Leave it unconfigured / a placeholder page.** No tenant lives at the
  apex; it either 404s or shows a minimal "you're looking for
  `<yourslug>.simple-business-manager.com`" static page. Simplest, and
  consistent with `CLAUDE.md`'s existing framing that this product is
  internal-facing per client, not a public-facing brand with a marketing
  site.
- **A real marketing/landing page**, if this is meant to eventually be
  pitched to prospective tenants as a product rather than only ever
  privately onboarded by you. Bigger scope than this plan covers — worth
  its own decision later, not blocking domain purchase or tenant onboarding
  now.

Recommend the first option for now — buy the domain, wire up tenant
subdomains, leave the apex as an unconfigured placeholder until there's an
actual reason to build something there.

### One naming thing worth a gut check

`CLAUDE.md` is explicit that "Simple Business Manager" is internal-only —
"never on invoices, quotes, letterhead, or anything customer-facing." A
tenant's staff logging in at `relai-world.simple-business-manager.com`
doesn't violate that (their own customers never see this URL — only their
own staff, logging in to manage their own calls), but it does mean the
product's own name is now visible in a URL bar rather than fully invisible
the way `*.workers.dev` incidentally kept it. Worth a moment's thought on
whether that's fine (probably is — it's still not on anything the tenant's
*own* customers see) before it's live everywhere.

## Cloudflare setup (manual, account-owner only)

Same caveat as the existing (never-activated) `jainglass.dev` comment in
`wrangler.jsonc`: adding a domain as a Cloudflare zone and pointing its
nameservers there can only be done by whoever owns the Cloudflare account —
not something `wrangler` or this plan can automate.

1. Buy `simple-business-manager.com` (wherever — Cloudflare Registrar is the
   obvious choice since the zone needs to live in Cloudflare anyway, avoids
   a separate registrar-to-Cloudflare nameserver handoff step).
2. Add it as a zone in the Cloudflare dashboard (Websites → Add a domain).
   If bought through Cloudflare Registrar this is automatic.
3. Per tenant, add a `routes` block to that tenant's `env` in
   `wrangler.jsonc` (same mechanism as the dead `jainglass.dev` comment):

```jsonc
"env": {
  "jainglass": {
    "name": "sbm-pipeline-jainglass",
    // ...vars/r2_buckets/d1_databases as in docs/MULTI_TENANCY_PLAN.md...
    "routes": [
      { "pattern": "jainglass.simple-business-manager.com", "custom_domain": true }
    ]
  },
  "relai-world": {
    "name": "sbm-pipeline-relai-world",
    // ...
    "routes": [
      { "pattern": "relai-world.simple-business-manager.com", "custom_domain": true }
    ]
  }
}
```

`custom_domain: true` makes Cloudflare create/manage the DNS record and TLS
certificate itself — don't also add a manual CNAME, same note as the
existing dead comment warns against.

4. Update each tenant's `PUBLIC_BASE_URL` var to the new subdomain once its
   route is live (it's currently used for Sarvam webhook callback origin on
   cron-triggered polls, which have no request URL to infer it from) —
   `docs/UAT_ENVIRONMENT_PLAN.md` and `docs/MULTI_TENANCY_PLAN.md`'s
   templates both already have a `PUBLIC_BASE_URL` line to swap.
5. Redeploy that tenant's env (`wrangler deploy --env <slug>`) — routes take
   effect on deploy, not before.

## Sequencing relative to the other two plans

Doesn't block either. `docs/UAT_ENVIRONMENT_PLAN.md` can be provisioned
today against `*.workers.dev` with no domain at all — UAT was already
decided not to need a subdomain. `docs/MULTI_TENANCY_PLAN.md`'s Relai World
onboarding can also happen on `*.workers.dev` first and get a custom domain
route added afterward with no disruption (it's an additive `routes` entry +
redeploy, not a rebuild). Buy the domain whenever convenient; it slots into
either plan without forcing rework of what's already been provisioned.
