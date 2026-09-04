/** Shared Anthropic Messages API helpers — prompt caching on static blocks. */

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";

/** Anthropic accepts "5m" (default) and "1h" (extended) — no 2h pool on the API. */
export type AnthropicCacheControl = { type: "ephemeral"; ttl?: "5m" | "1h" };

/** Extended TTL for static system prompts (Sonnet + Haiku). */
export const PROMPT_EPHEMERAL_CACHE: AnthropicCacheControl = {
  type: "ephemeral",
  ttl: "1h",
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
 * Sonnet / Haiku / Opus — cache the static system block (prefix includes
 * tools + system per API order). Minimum cacheable length: ~1k tokens
 * (Sonnet), ~4k (Haiku 4.5 / Opus); prompts below that are sent with
 * cache_control but may not create a cache entry.
 */
export function promptCacheControlForModel(model: string): AnthropicCacheControl | null {
  const m = model.toLowerCase();
  if (m.includes("haiku") || m.includes("sonnet") || m.includes("opus")) {
    return PROMPT_EPHEMERAL_CACHE;
  }
  return null;
}

/** Static system prompt — cached for Sonnet and Haiku when above model minimums. */
export function cachedSystemPrompt(
  text: string,
  model: string
): string | CachedTextBlock[] {
  const cache = promptCacheControlForModel(model);
  if (!cache) return text;
  return [{ type: "text", text, cache_control: cache }];
}
