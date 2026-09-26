#!/usr/bin/env npx tsx
/**
 * One-shot: match open desk todos (no site_id) to existing sites and write
 * todos.site_id + call_sites. Uses the same scorer as extraction.
 *
 * Does not create new sites. Safe to re-run (idempotent).
 *
 * Usage:
 *   npx tsx scripts/rematch-desk-sites.mts uat
 *   npx tsx scripts/rematch-desk-sites.mts dev
 *   npx tsx scripts/rematch-desk-sites.mts local
 *
 * Prefer running after deploy of the extraction matcher so new desk notes
 * also link; this script only backfills rows that already missed the link.
 */
import { spawnSync } from "node:child_process";
import {
  pickExistingSiteId,
  type SiteMatchCandidate,
} from "@sbm/core";

type EnvName = "dev" | "uat" | "local";

function wranglerArgs(env: EnvName): string[] {
  if (env === "local") {
    return ["d1", "execute", "sbm-dev", "--local", "--json"];
  }
  if (env === "uat") {
    return ["d1", "execute", "sbm-uat", "--env", "uat", "--remote", "--json"];
  }
  return ["d1", "execute", "sbm-dev", "--remote", "--json"];
}

function d1Json<T>(env: EnvName, command: string): T[] {
  const r = spawnSync("npx", ["wrangler", ...wranglerArgs(env), "--command", command], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "wrangler failed\n");
    process.exit(r.status || 1);
  }
  const parsed = JSON.parse(r.stdout) as Array<{ results?: T[] }>;
  const last = parsed[parsed.length - 1];
  return last?.results ?? [];
}

function d1Exec(env: EnvName, command: string): void {
  const args = wranglerArgs(env).filter((a) => a !== "--json");
  const r = spawnSync("npx", ["wrangler", ...args, "--command", command], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "wrangler failed\n");
    process.exit(r.status || 1);
  }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const env = (process.argv[2] || "uat") as EnvName;
if (!["dev", "uat", "local"].includes(env)) {
  console.error("Usage: npx tsx scripts/rematch-desk-sites.mts [dev|uat|local]");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

const candidates = d1Json<SiteMatchCandidate>(
  env,
  `SELECT id, name, site_name_being_used, house_no, sector, is_confirmed FROM sites`
);

const todos = d1Json<{
  todo_id: string;
  call_id: string;
  text: string;
  recorded_at: string | null;
}>(
  env,
  `SELECT todos.id AS todo_id,
          todos.call_id AS call_id,
          todos.text AS text,
          calls.recorded_at AS recorded_at
   FROM todos
   JOIN calls ON calls.id = todos.call_id
   WHERE calls.uploaded_by_user_id IS NOT NULL
     AND calls.recorded_for_site_id IS NULL
     AND calls.deleted_at IS NULL
     AND todos.status = 'open'
     AND todos.site_id IS NULL`
);

const callIds = new Set(todos.map((t) => t.call_id));
let todosUpdated = 0;
let callSitesLinked = 0;
const linkedPairs = new Set<string>();

console.log(
  `rematch-desk-sites (${env}${dryRun ? ", dry-run" : ""}): ${todos.length} open desk todos without site_id, ${candidates.length} sites`
);

for (const row of todos) {
  const siteId = pickExistingSiteId(row.text, candidates, { allowWeakContains: true });
  if (!siteId) continue;
  const site = candidates.find((c) => c.id === siteId);
  console.log(`  todo ${row.todo_id.slice(0, 8)}… → ${site?.name ?? siteId} (call ${row.call_id.slice(0, 8)}…)`);
  if (dryRun) {
    todosUpdated += 1;
    continue;
  }
  d1Exec(
    env,
    `UPDATE todos SET site_id = ${sqlString(siteId)} WHERE id = ${sqlString(row.todo_id)} AND site_id IS NULL`
  );
  todosUpdated += 1;
  const pairKey = `${row.call_id}:${siteId}`;
  if (linkedPairs.has(pairKey)) continue;
  linkedPairs.add(pairKey);
  const existing = d1Json<{ ok: number }>(
    env,
    `SELECT 1 AS ok FROM call_sites WHERE call_id = ${sqlString(row.call_id)} AND site_id = ${sqlString(siteId)}`
  );
  if (existing.length === 0) {
    d1Exec(
      env,
      `INSERT OR IGNORE INTO call_sites (call_id, site_id) VALUES (${sqlString(row.call_id)}, ${sqlString(siteId)})`
    );
    callSitesLinked += 1;
    const at = row.recorded_at ? sqlString(row.recorded_at) : "datetime('now')";
    d1Exec(
      env,
      `INSERT INTO site_activity_summary (site_id, last_activity_at, last_source, last_ref_id)
       VALUES (${sqlString(siteId)}, ${at}, 'call', ${sqlString(row.call_id)})
       ON CONFLICT(site_id) DO UPDATE SET
         last_activity_at = CASE
           WHEN excluded.last_activity_at >= site_activity_summary.last_activity_at
           THEN excluded.last_activity_at
           ELSE site_activity_summary.last_activity_at
         END,
         last_source = CASE
           WHEN excluded.last_activity_at >= site_activity_summary.last_activity_at
           THEN excluded.last_source
           ELSE site_activity_summary.last_source
         END,
         last_ref_id = CASE
           WHEN excluded.last_activity_at >= site_activity_summary.last_activity_at
           THEN excluded.last_ref_id
           ELSE site_activity_summary.last_ref_id
         END`
    );
  }
}

console.log(
  JSON.stringify(
    {
      callsScanned: callIds.size,
      todosUpdated,
      callSitesLinked: dryRun ? linkedPairs.size : callSitesLinked,
      dryRun,
    },
    null,
    2
  )
);
