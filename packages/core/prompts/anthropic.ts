/** Shared Anthropic Messages API helpers — prompt caching on static blocks. */

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";

/** Sonnet 5 / Opus 5 — 5-minute ephemeral cache (default TTL, stated explicitly). */
export type AnthropicCacheControl = { type: "ephemeral"; ttl?: "5m" | "1h" };

export const SONNET5_EPHEMERAL_CACHE: AnthropicCacheControl = {
  type: "ephemeral",
  ttl: "5m",
};

export type CachedTextBlock = {
  type: "text";
  text: string;
  cache_control: AnthropicCacheControl;
};

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function anthropicRequestHeaders(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_API_VERSION,
    "content-type": "application/json",
  };
}

/**
 * Claude Sonnet 5 / Opus 5 — 1,024-token minimum per cache breakpoint.
 * Haiku 4.5 needs 4,096 tokens; our scan prompts are below that, so skip.
 * Place one breakpoint on the system block; the cached prefix includes
 * tools + system (API order: tools → system → messages).
 */
export function promptCacheControlForModel(model: string): AnthropicCacheControl | null {
  const m = model.toLowerCase();
  if (m.includes("claude-sonnet-5") || m.includes("claude-opus-5")) {
    return SONNET5_EPHEMERAL_CACHE;
  }
  return null;
}

/** Static system prompt — cached for Sonnet 5 when the roster-heavy block clears 1k tokens. */
export function cachedSystemPrompt(
  text: string,
  model: string
): string | CachedTextBlock[] {
  const cache = promptCacheControlForModel(model);
  if (!cache) return text;
  return [{ type: "text", text, cache_control: cache }];
}
