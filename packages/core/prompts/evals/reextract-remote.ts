// One-shot: re-extract a remote call with ACTIVE prompt via wrangler d1 + Anthropic.
// Usage: ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-sonnet-5 tsx packages/core/prompts/evals/reextract-remote.ts <callId>
// Does not go through the Worker — writes D1 directly (admin recovery after prompt bump).

import { spawnSync } from "node:child_process";
import { extractCall } from "../extract.js";
import { ACTIVE } from "../index.js";
import type { DiarizedEntry } from "../../src/types.js";

function d1Json(command: string): unknown {
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "sbm-dev", "--remote", "--json", "--command", command],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }
  );
  if (r.status !== 0) {
    throw new Error(`wrangler d1 failed: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout);
}

function firstRows(result: unknown): Record<string, unknown>[] {
  const arr = result as Array<{ results?: Record<string, unknown>[] }>;
  return arr[0]?.results ?? [];
}

function sqlStr(v: string | null | undefined): string {
  if (v == null) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

async function main() {
  const callId = process.argv[2];
  if (!callId) {
    console.error("Usage: tsx .../reextract-remote.ts <callId>");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY required");
    process.exit(1);
  }
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  const rows = firstRows(
    d1Json(
      `SELECT calls.recorded_at AS recorded_at, transcripts.diarized_transcript AS diarized_transcript
       FROM calls LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
       WHERE calls.id = '${callId.replace(/'/g, "''")}'`
    )
  );
  if (rows.length === 0) throw new Error(`call not found: ${callId}`);
  const recordedAt = (rows[0].recorded_at as string | null) ?? null;
  let entries: DiarizedEntry[] = [];
  const raw = rows[0].diarized_transcript as string | null;
  if (raw) {
    const parsed = JSON.parse(raw) as { entries?: DiarizedEntry[] };
    entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  }
  if (entries.length === 0) throw new Error("no diarized entries");

  console.log(`Extracting ${callId} with ${ACTIVE.version} (${entries.length} entries)...`);
  const extraction = await extractCall({
    apiKey,
    model,
    clientName: null,
    recordedAt,
    entries,
  });
  console.log(`Got ${extraction.todos.length} todos, deadline=${extraction.deadline ?? ""}`);

  const stmts: string[] = [
    `DELETE FROM todos WHERE call_id = ${sqlStr(callId)} AND origin = 'llm'`,
    `DELETE FROM commitments WHERE call_id = ${sqlStr(callId)}`,
    `UPDATE calls SET stt_status = 'extracted', call_type = ${sqlStr(extraction.call_type)},
      summary = ${sqlStr(extraction.summary)},
      key_takeaways = ${sqlStr(JSON.stringify(extraction.key_takeaways))},
      unresolved = ${sqlStr(JSON.stringify(extraction.unresolved))},
      material_needs = ${sqlStr(JSON.stringify(extraction.material_needs))},
      deadline = ${sqlStr(extraction.deadline || null)},
      prompt_version = ${sqlStr(ACTIVE.version)}
     WHERE id = ${sqlStr(callId)}`,
  ];

  for (const todo of extraction.todos) {
    const id = crypto.randomUUID();
    stmts.push(
      `INSERT INTO todos (id, call_id, owner, text, due_date, origin) VALUES (${sqlStr(id)}, ${sqlStr(callId)}, ${sqlStr(todo.owner)}, ${sqlStr(todo.text)}, ${sqlStr(todo.due_date || null)}, 'llm')`
    );
  }
  for (const c of extraction.commitments) {
    const id = crypto.randomUUID();
    stmts.push(
      `INSERT INTO commitments (id, call_id, raw_phrase, resolved_datetime, promised_to) VALUES (${sqlStr(id)}, ${sqlStr(callId)}, ${sqlStr(c.raw_phrase)}, ${sqlStr(c.resolved_datetime || null)}, ${sqlStr(c.promised_to || null)})`
    );
  }

  // One statement per execute — D1 remote CLI is picky about batches.
  for (const s of stmts) {
    d1Json(s);
  }
  console.log(`Wrote ${extraction.todos.length} todos, prompt_version=${ACTIVE.version}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
