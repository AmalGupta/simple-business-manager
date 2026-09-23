#!/usr/bin/env node
/**
 * Backfill sites.site_name_being_used to match composeSiteNameBeingUsed
 * (packages/core/src/queries.ts). Used because migration 0037's set-based
 * SQL OOMs remote D1 (SQLITE_NOMEM).
 *
 * Usage:
 *   node scripts/backfill-site-display-names.mjs dev
 *   node scripts/backfill-site-display-names.mjs uat
 *   node scripts/backfill-site-display-names.mjs local
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SEP = " | CL. ";
const HOUSE_NO_PREFIX = /^(?:#|h\.?\s?no\.?|house\s?no\.?)\s*(?=\S)/i;

function clean(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

/** Keep in lockstep with composeSiteNameBeingUsed in packages/core/src/queries.ts */
export function composeSiteNameBeingUsed(site) {
  const name = clean(site.name);
  const houseNo = clean(clean(site.house_no)?.replace(HOUSE_NO_PREFIX, ""));
  const sector = clean(site.sector);
  const city = clean(site.city);
  const client = clean(site.poc_name);
  const phone = clean(site.poc_contact_number);
  const freeform = clean(site.address);
  const locality = sector && city ? `${sector}-${city}` : sector || city;
  const fullAddress = houseNo && locality ? `#${houseNo}, ${locality}` : null;
  const partialAddress = fullAddress ? null : freeform || locality || null;

  let metaSyntax = null;
  if (fullAddress) {
    metaSyntax = client ? `${fullAddress}${SEP}${client}` : fullAddress;
  } else if (partialAddress && client) {
    metaSyntax = `${partialAddress}${SEP}${client}`;
  } else if (partialAddress) {
    metaSyntax = partialAddress;
  }

  let display = null;
  if (fullAddress) {
    display = metaSyntax;
  } else if (metaSyntax) {
    if (
      name &&
      metaSyntax !== name &&
      !metaSyntax.startsWith(`${name} |`) &&
      !metaSyntax.startsWith(`${name}${SEP}`)
    ) {
      display = `${name} | ${metaSyntax}`;
    } else {
      display = metaSyntax;
    }
  } else if (client && name) {
    display = `${name}${SEP}${client}`;
  } else {
    return null;
  }

  if (phone && !display.includes(phone)) {
    display = `${display} | ${phone}`;
  }
  return display;
}

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function wranglerArgs(env) {
  if (env === "uat") return ["d1", "execute", "sbm-uat", "--env", "uat", "--remote"];
  if (env === "local") return ["d1", "execute", "sbm-dev", "--local"];
  return ["d1", "execute", "sbm-dev", "--remote"];
}

function d1Json(env, command) {
  const args = [...wranglerArgs(env), "--json", "--command", command];
  const r = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "wrangler failed\n");
    process.exit(r.status || 1);
  }
  const start = r.stdout.indexOf("[");
  const data = JSON.parse(r.stdout.slice(start));
  return data[0]?.results ?? [];
}

function d1Exec(env, command) {
  const args = [...wranglerArgs(env), "--command", command];
  const r = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "wrangler failed\n");
    process.exit(r.status || 1);
  }
}

const env = process.argv[2] || "dev";
if (!["dev", "uat", "local"].includes(env)) {
  console.error("Usage: node scripts/backfill-site-display-names.mjs [dev|uat|local]");
  process.exit(1);
}

const rows = d1Json(
  env,
  `SELECT id, name, house_no, sector, city, address, poc_name, poc_contact_number, site_name_being_used FROM sites`
);

let changed = 0;
let same = 0;
for (const row of rows) {
  const next = composeSiteNameBeingUsed(row);
  const prev = clean(row.site_name_being_used);
  if (prev === next) {
    same++;
    continue;
  }
  d1Exec(
    env,
    `UPDATE sites SET site_name_being_used = ${sqlString(next)} WHERE id = ${sqlString(row.id)}`
  );
  changed++;
  console.log(`updated ${row.name} → ${next ?? "NULL"}`);
}

console.log(`done (${env}): ${changed} updated, ${same} unchanged, ${rows.length} total`);
