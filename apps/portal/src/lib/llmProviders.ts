/**
 * Portal-side LLM provider registry.
 *
 * Defines the canonical list of supported providers, their display names,
 * required env var names, and default models.  The `available` flag is
 * evaluated server-side (env var presence) so the UI can grey-out
 * providers whose API keys have not been configured.
 */

export type ProviderId = "anthropic" | "openai" | "grok";

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  /** Environment variable that must be set for this provider to be usable. */
  apiKeyEnvVar: string;
  defaultModel: string;
  /** True when the env var is non-empty at server startup. */
  available: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    displayName: "Anthropic (Claude)",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
    available: !!process.env.ANTHROPIC_API_KEY,
  },
  {
    id: "openai",
    displayName: "OpenAI (GPT-4o)",
    apiKeyEnvVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    available: !!process.env.OPENAI_API_KEY,
  },
  {
    id: "grok",
    displayName: "Grok (xAI)",
    apiKeyEnvVar: "XAI_API_KEY",
    defaultModel: "grok-2-1212",
    available: !!process.env.XAI_API_KEY,
  },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function validateProviderId(id: string): id is ProviderId {
  return PROVIDERS.some((p) => p.id === id);
}
