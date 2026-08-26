// Reads .dev.vars (gitignored, local profile only — docs/LOCAL_PROFILE.md)
// so tests can send the same X-SBM-Key the worker itself was started with.
// Never touches remote secrets.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let cache: Record<string, string> | null = null;

function readDevVars(): Record<string, string> {
  if (cache) return cache;
  const raw = readFileSync(path.join(ROOT_DIR, ".dev.vars"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  cache = out;
  return out;
}

export function sbmApiKey(): string {
  const key = readDevVars().SBM_API_KEY;
  if (!key) throw new Error("SBM_API_KEY missing from .dev.vars — run the e2e webServer setup first");
  return key;
}
