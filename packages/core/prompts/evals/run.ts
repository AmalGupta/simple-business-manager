// Scores extraction against golden/*.json — see docs/BUILD_BRIEF.md "The prompt layer".
//
// Rebalanced 2026-09-04 (see the "Todo detection > owner attribution priority"
// project decision from that session): todo existence and todo text accuracy
// are the only things that gate pass/fail (tier 1). due_date/deadline/
// unresolved accuracy are scored and reported but don't gate (tier 2) — they
// matter for prompt tuning but a call with the right todos and a slightly-off
// date is a much smaller problem than a call missing the todo entirely. owner/
// blocked_on/promised_to are tracked for visibility only (tier 3) — the
// business owner corrects these himself in the dashboard, so a wrong owner on
// an otherwise-correct todo should never fail a golden case.
//
// Matching is now judge-based rather than owner-keyed: an LLM call matches
// expected todos to actual todos by whether they describe the same real task,
// independent of wording or owner — this also means a hallucinated/phantom
// todo (an actual with no expected match) is counted as a false positive,
// which the old `length >= expected.length` check let slide.
//
// Node-only (fs/tsx), excluded from the Worker typecheck — same pattern as the
// app's own evals/ and qa/ trees. Run with: pnpm eval

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCall } from "../extract.js";
import { ANTHROPIC_MESSAGES_URL, anthropicRequestHeaders } from "../anthropic.js";
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

/** Cheap model for matching — this is a same-task judgment, not extraction. */
const JUDGE_MODEL = process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";

/** Roster / STT aliases — Tanseem in roster often appears as Tanzeem in diarization. Only used for the tier-3 owner report, never for matching. */
function normalizeOwner(owner: string | null | undefined): string {
  const o = (owner ?? "").trim().toLowerCase();
  if (o === "tanzeem") return "tanseem";
  return o;
}

const MATCH_TOOL = {
  name: "match_items",
  description:
    "Match entries between two lists of short task/item descriptions from the same phone call, where wording may differ but a matched pair must describe the same real task or item.",
  input_schema: {
    type: "object",
    properties: {
      pairs: {
        type: "array",
        description: "0-based index pairs — one expected entry matched to one actual entry describing the same real task/item. Omit an index entirely if it has no real match; do not force a match on a merely-similar-sounding but different task.",
        items: {
          type: "object",
          properties: {
            expected_index: { type: "number" },
            actual_index: { type: "number" },
          },
          required: ["expected_index", "actual_index"],
        },
      },
    },
    required: ["pairs"],
  },
} as const;

interface MatchResult {
  truePositives: number;
  falseNegatives: number; // expected entries with no actual match — missed
  falsePositives: number; // actual entries with no expected match — phantom/hallucinated
  pairs: Array<{ expectedIndex: number; actualIndex: number }>;
}

function precisionRecallF1(tp: number, fp: number, fn: number) {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/** LLM-judge matching — replaces the old owner-keyed positional matching, which broke down as soon as one owner had multiple todos and couldn't detect a hallucinated extra todo at all. */
async function matchByJudge(
  label: string,
  expectedTexts: string[],
  actualTexts: string[],
  apiKey: string
): Promise<MatchResult> {
  if (expectedTexts.length === 0 && actualTexts.length === 0) {
    return { truePositives: 0, falseNegatives: 0, falsePositives: 0, pairs: [] };
  }
  if (expectedTexts.length === 0 || actualTexts.length === 0) {
    return { truePositives: 0, falseNegatives: expectedTexts.length, falsePositives: actualTexts.length, pairs: [] };
  }

  const prompt =
    `Two lists of ${label}, possibly worded differently, extracted from the same phone call transcript. ` +
    `Match entries describing the same real task/item — different phrasing of the same thing is a match, a different task is not, even if superficially similar.\n\n` +
    `Expected:\n${expectedTexts.map((t, i) => `${i}: ${t}`).join("\n")}\n\n` +
    `Actual:\n${actualTexts.map((t, i) => `${i}: ${t}`).join("\n")}`;

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicRequestHeaders(apiKey),
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 1000,
      tools: [MATCH_TOOL],
      tool_choice: { type: "tool", name: "match_items" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`judge call failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; input?: unknown }> };
  const block = data.content.find((b) => b.type === "tool_use");
  const rawPairs =
    (block?.input as { pairs?: Array<{ expected_index: number; actual_index: number }> } | undefined)?.pairs ?? [];

  const usedExpected = new Set<number>();
  const usedActual = new Set<number>();
  const pairs: Array<{ expectedIndex: number; actualIndex: number }> = [];
  for (const p of rawPairs) {
    const ei = p.expected_index;
    const ai = p.actual_index;
    if (
      typeof ei === "number" && typeof ai === "number" &&
      ei >= 0 && ei < expectedTexts.length &&
      ai >= 0 && ai < actualTexts.length &&
      !usedExpected.has(ei) && !usedActual.has(ai)
    ) {
      pairs.push({ expectedIndex: ei, actualIndex: ai });
      usedExpected.add(ei);
      usedActual.add(ai);
    }
  }

  return {
    truePositives: pairs.length,
    falseNegatives: expectedTexts.length - pairs.length,
    falsePositives: actualTexts.length - pairs.length,
    pairs,
  };
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

  const todoF1s: number[] = [];
  let casesFullyPassed = 0;

  for (const file of files) {
    const goldenCase = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf-8")) as GoldenCase;
    const actual = await extractCall({
      apiKey,
      model,
      clientName: goldenCase.clientName,
      recordedAt: goldenCase.recordedAt,
      entries: goldenCase.entries,
    });

    const expectedTodos = goldenCase.expected.todos ?? [];
    const todoMatch = await matchByJudge(
      "todo descriptions",
      expectedTodos.map((t) => t.text),
      actual.todos.map((t) => t.text),
      apiKey
    );
    const todoPRF = precisionRecallF1(todoMatch.truePositives, todoMatch.falsePositives, todoMatch.falseNegatives);
    todoF1s.push(todoPRF.f1);

    console.log(`\n${goldenCase.name}`);
    console.log(
      `  TIER 1 (gates pass/fail) — todos: precision ${todoPRF.precision.toFixed(2)}, recall ${todoPRF.recall.toFixed(2)}, F1 ${todoPRF.f1.toFixed(2)}`
    );
    for (const idx of expectedTodos.keys()) {
      if (!todoMatch.pairs.some((p) => p.expectedIndex === idx)) {
        console.log(`    MISSED: "${expectedTodos[idx].text}"`);
      }
    }
    for (const idx of actual.todos.keys()) {
      if (!todoMatch.pairs.some((p) => p.actualIndex === idx)) {
        console.log(`    PHANTOM (not in expected): "${actual.todos[idx].text}"`);
      }
    }
    if (todoPRF.f1 === 1) casesFullyPassed += 1;

    // Tier 2 — scored, informs prompt tuning, does not gate.
    console.log("  TIER 2 (scored, non-gating) — due_date / deadline / sites / unresolved:");
    for (const { expectedIndex, actualIndex } of todoMatch.pairs) {
      const exp = expectedTodos[expectedIndex];
      const act = actual.todos[actualIndex];
      const pass = (exp.due_date || "") === (act.due_date || "");
      if (!pass) console.log(`    due_date mismatch on "${exp.text}": expected ${JSON.stringify(exp.due_date)}, got ${JSON.stringify(act.due_date)}`);
    }
    if (goldenCase.expected.sites) {
      // Exact-set compare, not judge-matched — site names are meant to hit the known
      // roster verbatim (rule 7), so unlike todos/unresolved a paraphrase isn't expected.
      const expSites = new Set(goldenCase.expected.sites);
      const actSites = new Set(actual.sites);
      const missing = [...expSites].filter((s) => !actSites.has(s));
      const extra = [...actSites].filter((s) => !expSites.has(s));
      if (missing.length > 0) console.log(`    sites missing: ${JSON.stringify(missing)}`);
      if (extra.length > 0) console.log(`    sites not expected (possible hallucination/metadata leak): ${JSON.stringify(extra)}`);
    }
    if (goldenCase.expected.deadline !== undefined) {
      const pass = (goldenCase.expected.deadline || "") === (actual.deadline || "");
      if (!pass) console.log(`    deadline mismatch: expected ${JSON.stringify(goldenCase.expected.deadline)}, got ${JSON.stringify(actual.deadline)}`);
    }
    const expectedUnresolved = goldenCase.expected.unresolved ?? [];
    if (expectedUnresolved.length > 0 || actual.unresolved.length > 0) {
      const unresolvedMatch = await matchByJudge(
        "unresolved items",
        expectedUnresolved.map((u) => u.item),
        actual.unresolved.map((u) => u.item),
        apiKey
      );
      const prf = precisionRecallF1(unresolvedMatch.truePositives, unresolvedMatch.falsePositives, unresolvedMatch.falseNegatives);
      console.log(`    unresolved: precision ${prf.precision.toFixed(2)}, recall ${prf.recall.toFixed(2)}`);
    }
    if (goldenCase.expected.commitments) {
      goldenCase.expected.commitments.forEach((expC, i) => {
        const actC = actual.commitments[i];
        const pass = (expC.resolved_datetime || "") === (actC?.resolved_datetime || "");
        if (!pass) console.log(`    commitments[${i}].resolved_datetime mismatch: expected ${JSON.stringify(expC.resolved_datetime)}, got ${JSON.stringify(actC?.resolved_datetime)}`);
      });
    }

    // Tier 3 — tracked for visibility only. Never affects pass/fail.
    console.log("  TIER 3 (visibility only, not scored) — owner:");
    for (const { expectedIndex, actualIndex } of todoMatch.pairs) {
      const exp = expectedTodos[expectedIndex];
      const act = actual.todos[actualIndex];
      const pass = normalizeOwner(exp.owner) === normalizeOwner(act.owner);
      console.log(`    "${exp.text}" — expected owner ${JSON.stringify(exp.owner)}, got ${JSON.stringify(act.owner)}${pass ? "" : "  [differs]"}`);
    }
  }

  const avgF1 = todoF1s.reduce((a, b) => a + b, 0) / todoF1s.length;
  console.log(`\nTodo-detection F1 across ${files.length} calls: ${avgF1.toFixed(2)} average, ${casesFullyPassed}/${files.length} calls with perfect todo match.`);
}

main();
