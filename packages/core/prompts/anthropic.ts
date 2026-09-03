/** Shared Anthropic Messages API helpers — ephemeral prompt cache on static blocks. */

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";

export const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" as const };

export type CachedTextBlock = {
  type: "text";
  text: string;
  cache_control: typeof EPHEMERAL_CACHE_CONTROL;
};

export function anthropicRequestHeaders(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_API_VERSION,
    "content-type": "application/json",
  };
}

/** Static system prompt — reused across calls for the same prompt version. */
export function cachedSystemPrompt(text: string): CachedTextBlock[] {
  return [{ type: "text", text, cache_control: EPHEMERAL_CACHE_CONTROL }];
}

/** Tool schema is static per prompt version — cache alongside the system block. */
export function withCachedTool<T extends object>(
  tool: T
): T & { cache_control: typeof EPHEMERAL_CACHE_CONTROL } {
  return { ...tool, cache_control: EPHEMERAL_CACHE_CONTROL };
}
