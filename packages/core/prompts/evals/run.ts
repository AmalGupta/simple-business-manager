// Scores extraction against golden/*.json — see docs/BUILD_BRIEF.md "The prompt layer".
//
// The eval scores fields, not vibes: deadlines, quantities, names, and amounts
// are the only things worth scoring — they are what feed a missed deadline.
// A summary that reads nicely and a date that is a day wrong is a failure.
//
// Node-only (fs/tsx), excluded from the Worker typecheck — same pattern as the
// app's own evals/ and qa/ trees. Run with: tsx packages/core/prompts/evals/run.ts
//
// Not populated yet: the golden set starts at three real calls, and none exist
// in this repo. Drop {transcript, expected} pairs into golden/*.json to use this.

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCall } from "../extract.js";
import type { DiarizedEntry, CallExtraction } from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__dirname, "golden");

interface GoldenCase {
  name: string;
  clientName: string | null;
  recordedAt: string | null;
  entries: DiarizedEntry[];
  expected: Partial<CallExtraction>;
}

/** Only what docs/ADDITIONAL_FEATURES_M0.md "The prompt layer"-equivalent scoring says is worth scoring: deadlines, quantities, names, amounts. */
function scoreFields(expected: Partial<CallExtraction>, actual: CallExtraction) {
  const results: Array<{ field: string; pass: boolean; expected: unknown; actual: unknown }> = [];

  if (expected.deadline !== undefined) {
    results.push({
      field: "deadline",
      pass: (expected.deadline || "") === (actual.deadline || ""),
      expected: expected.deadline,
      actual: actual.deadline,
    });
  }

  if (expected.todos) {
    expected.todos.forEach((expTodo, i) => {
      const actTodo = actual.todos[i];
      results.push({
        field: `todos[${i}].owner`,
        pass: expTodo.owner === actTodo?.owner,
        expected: expTodo.owner,
        actual: actTodo?.owner,
      });
      results.push({
        field: `todos[${i}].due_date`,
        pass: (expTodo.due_date || "") === (actTodo?.due_date || ""),
        expected: expTodo.due_date,
        actual: actTodo?.due_date,
      });
    });
  }

  if (expected.commitments) {
    expected.commitments.forEach((expC, i) => {
      const actC = actual.commitments[i];
      results.push({
        field: `commitments[${i}].resolved_datetime`,
        pass: (expC.resolved_datetime || "") === (actC?.resolved_datetime || ""),
        expected: expC.resolved_datetime,
        actual: actC?.resolved_datetime,
      });
    });
  }

  if (expected.unresolved) {
    expected.unresolved.forEach((expU, i) => {
      const actU = actual.unresolved[i];
      results.push({
        field: `unresolved[${i}].blocked_on`,
        pass: (expU.blocked_on || "") === (actU?.blocked_on || ""),
        expected: expU.blocked_on,
        actual: actU?.blocked_on,
      });
    });
  }

  return results;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set in the environment.");
    process.exit(1);
  }
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  const files = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log(`No golden cases in ${GOLDEN_DIR} yet — add {transcript, expected} pairs from real calls.`);
    return;
  }

  let totalPass = 0;
  let totalChecked = 0;

  for (const file of files) {
    const goldenCase = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf-8")) as GoldenCase;
    const actual = await extractCall({
      apiKey,
      model,
      clientName: goldenCase.clientName,
      recordedAt: goldenCase.recordedAt,
      entries: goldenCase.entries,
    });

    const results = scoreFields(goldenCase.expected, actual);
    const pass = results.filter((r) => r.pass).length;
    totalPass += pass;
    totalChecked += results.length;

    console.log(`\n${goldenCase.name}: ${pass}/${results.length}`);
    for (const r of results) {
      if (!r.pass) console.log(`  FAIL ${r.field}: expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`);
    }
  }

  console.log(`\nTotal: ${totalPass}/${totalChecked} fields correct across ${files.length} calls.`);
}

main();
