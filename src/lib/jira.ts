// Jira Cloud REST API v3 — POST /rest/api/3/issue only, for the in-app
// request form (src/handlers/app-request.ts). Confirmed against Jira's Free
// plan: issue creation via the REST API is not plan-gated, only permission-
// gated on the authenticating account (2026-09-10 support-forum check).
//
// Auth is Basic base64(email:token) with an Atlassian API token — see
// docs/LOCAL_PROFILE.md and .dev.vars.example for where JIRA_EMAIL /
// JIRA_API_TOKEN live locally, and DEPLOY_RUNBOOK.md for the remote secret.
// The token's own account becomes the issue's reporter; Jira Cloud doesn't
// let the API set an arbitrary reporter unless that person is also a
// licensed user of the site, so the actual submitter's name is folded into
// the description text instead.

import type { Env } from "../index";

export interface JiraIssueResult {
  key: string;
  url: string;
}

/** Minimal Atlassian Document Format wrapper — v3 rejects a plain string description. */
function toAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : [],
    })),
  };
}

export async function createJiraIssue(
  env: Env,
  input: { summary: string; description: string; reporterName: string }
): Promise<JiraIssueResult> {
  if (!env.JIRA_BASE_URL || !env.JIRA_PROJECT_KEY || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
    throw new Error("Jira is not configured (JIRA_BASE_URL / JIRA_PROJECT_KEY / JIRA_EMAIL / JIRA_API_TOKEN)");
  }

  const auth = btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);
  const descriptionText = `Submitted by ${input.reporterName} via Simple Business Manager.\n\n${input.description}`;

  const res = await fetch(`https://${env.JIRA_BASE_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: env.JIRA_PROJECT_KEY },
        // Jira summary field caps at 255 chars server-side.
        summary: input.summary.slice(0, 250),
        description: toAdf(descriptionText),
        issuetype: { name: "Task" },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira issue create failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { key: string };
  return { key: data.key, url: `https://${env.JIRA_BASE_URL}/browse/${data.key}` };
}
