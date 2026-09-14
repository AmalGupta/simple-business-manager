#!/usr/bin/env npx tsx
/**
 * Read-only dry run: run proposeSiteContactBackfill against a UAT D1 snapshot.
 *
 *   1. npx wrangler d1 export sbm-uat --env uat --remote --output .tmp/uat-site-contact-dry-run.sql
 *   2. sqlite3 .tmp/uat-dry-run.db < .tmp/uat-site-contact-dry-run.sql
 *   3. npx tsx scripts/dry-run-site-contact-uat.mts
 *
 * Does not write to UAT or apply mappings.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { proposeSiteContactBackfill, type SiteContactBackfillProposal } from "@sbm/core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = join(ROOT, ".tmp/uat-dry-run.db");
const EXPORT_SQL = join(ROOT, ".tmp/uat-site-contact-dry-run.sql");

type Stmt = ReturnType<DatabaseSync["prepare"]>;

function wrapD1(sqlite: DatabaseSync): D1Database {
  const prepare = (query: string) => {
    let bound: unknown[] = [];
    const stmt = () => sqlite.prepare(query);

    const runBound = (): ReturnType<Stmt["run"]> => {
      const s = stmt();
      return bound.length ? s.run(...bound) : s.run();
    };

    const chain = {
      bind(...args: unknown[]) {
        bound = args;
        return chain;
      },
      async first<T>() {
        const s = stmt();
        const row = bound.length ? s.get(...bound) : s.get();
        return (row ?? null) as T | null;
      },
      async all<T>() {
        const s = stmt();
        const results = (bound.length ? s.all(...bound) : s.all()) as T[];
        return { results };
      },
      async run() {
        const info = runBound();
        return {
          success: true,
          meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
        };
      },
    };
    return chain;
  };

  return {
    prepare,
    async batch(statements: { sql: string; args?: unknown[] }[]) {
      sqlite.exec("BEGIN");
      try {
        for (const { sql, args = [] } of statements) {
          sqlite.prepare(sql).run(...args);
        }
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
      return statements.map(() => ({ success: true, meta: { changes: 0 } }));
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  } as D1Database;
}

function summarize(proposals: SiteContactBackfillProposal[]) {
  const byStatus = { proposed: 0, already_linked: 0, no_match: 0 };
  const scoreBuckets = { "100": 0, "80-99": 0, "40-79": 0 };
  for (const p of proposals) {
    byStatus[p.status]++;
    if (p.status === "proposed" && p.match_score) {
      if (p.match_score >= 100) scoreBuckets["100"]++;
      else if (p.match_score >= 80) scoreBuckets["80-99"]++;
      else scoreBuckets["40-79"]++;
    }
  }
  return { byStatus, scoreBuckets };
}

function printSample(proposals: SiteContactBackfillProposal[], n = 25) {
  if (process.argv.includes("--json")) return;
  const proposed = proposals.filter((p) => p.status === "proposed" && p.caller_id);
  console.log(`\nSample proposed mappings (top ${Math.min(n, proposed.length)} by score):\n`);
  console.log(
    "site".padEnd(36) +
      "client".padEnd(22) +
      "source".padEnd(28) +
      "contact".padEnd(28) +
      "score"
  );
  console.log("-".repeat(120));
  for (const p of proposed.slice(0, n)) {
    const contact = p.caller_phone ? `${p.caller_name} (${p.caller_phone})` : (p.caller_name ?? "");
    console.log(
      p.site_name.slice(0, 35).padEnd(36) +
        p.client_label.slice(0, 21).padEnd(22) +
        p.client_source.slice(0, 27).padEnd(28) +
        contact.slice(0, 27).padEnd(28) +
        String(p.match_score)
    );
  }
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const log = (...args: unknown[]) => {
    if (!jsonOut) console.log(...args);
  };
  if (!existsSync(DB_PATH)) {
    if (!existsSync(EXPORT_SQL)) {
      console.error(`Missing ${DB_PATH} and ${EXPORT_SQL}. Export UAT first (see script header).`);
      process.exit(1);
    }
    console.error(`Missing ${DB_PATH}. Run: sqlite3 .tmp/uat-dry-run.db < .tmp/uat-site-contact-dry-run.sql`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(DB_PATH, { readOnly: true });
  const sites = sqlite.prepare("SELECT COUNT(*) AS n FROM sites").get() as { n: number };
  const callers = sqlite.prepare("SELECT COUNT(*) AS n FROM callers").get() as { n: number };
  const links = sqlite.prepare("SELECT COUNT(*) AS n FROM caller_sites").get() as { n: number };
  log(`UAT snapshot: ${sites.n} sites, ${callers.n} callers, ${links.n} caller_sites links\n`);

  const t0 = Date.now();
  const proposals = await proposeSiteContactBackfill(wrapD1(sqlite));
  const ms = Date.now() - t0;

  if (jsonOut) {
    process.stdout.write(JSON.stringify({ proposals, meta: { ms, sites: sites.n, callers: callers.n, links: links.n } }));
    return;
  }

  const { byStatus, scoreBuckets } = summarize(proposals);
  log(`proposeSiteContactBackfill finished in ${ms}ms\n`);
  log("Status counts:");
  log(`  proposed (mappable):     ${byStatus.proposed}`);
  log(`  already_linked:          ${byStatus.already_linked}`);
  log(`  no_match:                ${byStatus.no_match}`);
  log("\nProposed match scores:");
  log(`  phone/exact (100):       ${scoreBuckets["100"]}`);
  log(`  strong name (80-99):     ${scoreBuckets["80-99"]}`);
  log(`  weaker (40-79):          ${scoreBuckets["40-79"]}`);

  printSample(proposals);

  const low = proposals.filter((p) => p.status === "proposed" && p.match_score > 0 && p.match_score < 80);
  if (low.length) {
    log(`\n${low.length} proposed row(s) with score < 80 (review before bulk map):`);
    for (const p of low.slice(0, 10)) {
      log(`  - ${p.site_name} → ${p.caller_name} (${p.match_score})`);
    }
  }

  log("\nDry run complete — no rows written to UAT.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
