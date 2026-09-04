#!/usr/bin/env node
// Read-only helper for scripts/deploy.sh — wrangler.jsonc is JSONC (has //
// and /* */ comments), so it can't go through plain JSON.parse. This never
// writes the file; deploy.sh treats "the env block doesn't exist yet" as a
// stop-and-tell-the-human case rather than auto-editing a hand-authored
// config file with comments in it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "wrangler.jsonc");

function stripJsonComments(text) {
  // Good enough for this file's actual style (// line comments, /* */ block
  // comments) — not a general JSONC parser, doesn't need to be one.
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === "\n") { inLineComment = false; out += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") { out += next; i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    out += c;
  }
  return out;
}

function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  // Trailing commas before a closing bracket are the other thing real JSONC
  // allows that JSON.parse rejects — strip those too.
  const stripped = stripJsonComments(raw).replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

const [, , cmd, envName] = process.argv;
const config = loadConfig();

function envBlock(name) {
  return config.env?.[name];
}

switch (cmd) {
  case "env-exists": {
    process.exit(envBlock(envName) ? 0 : 1);
  }
  case "worker-name": {
    console.log(envName === "dev" ? config.name : (envBlock(envName)?.name ?? `sbm-pipeline-${envName}`));
    break;
  }
  case "db-id": {
    const bindings = envName === "dev" ? config.d1_databases : envBlock(envName)?.d1_databases;
    console.log(bindings?.[0]?.database_id ?? "");
    break;
  }
  case "routes": {
    const routes = envName === "dev" ? config.routes : envBlock(envName)?.routes;
    console.log(JSON.stringify(routes ?? []));
    break;
  }
  default: {
    console.error(`unknown command: ${cmd}. Usage: wrangler-config.mjs <env-exists|worker-name|db-id|routes> <envName>`);
    process.exit(2);
  }
}
