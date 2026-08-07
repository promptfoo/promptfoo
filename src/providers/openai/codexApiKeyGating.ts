/**
 * Shared API-key gating for the two Codex providers (`openai:codex-sdk` and
 * `openai:codex-app-server`). Both spawn the Codex CLI and must decide identically whether the
 * resolved Codex/OpenAI API key belongs to the active backend. When routing through a
 * non-OpenAI `model_provider` (e.g. `amazon-bedrock`), an ambient `OPENAI_API_KEY` /
 * `CODEX_API_KEY` is unrelated to the backend (Bedrock authenticates via AWS credentials) and
 * must never reach the agent shell. Keeping this logic in one place stops the two providers
 * from drifting apart.
 */

/** Minimal structural shape that both Codex provider configs satisfy. */
export interface CodexApiKeyGatingConfig {
  model_provider?: string;
  cli_config?: Record<string, unknown>;
  apiKey?: string;
  cli_env?: Record<string, unknown>;
}

/**
 * Whether the provider routes inference through a non-OpenAI Codex model provider
 * (e.g. `amazon-bedrock`). When it does, the model id belongs to that provider's namespace and
 * an ambient OpenAI/Codex key is unrelated to the active backend, so promptfoo's OpenAI model
 * allowlist no longer applies and the key must not be injected.
 */
export function usesCustomModelProvider(config: CodexApiKeyGatingConfig): boolean {
  const cliConfigProvider = config.cli_config?.model_provider;
  const provider =
    config.model_provider ??
    (typeof cliConfigProvider === 'string' ? cliConfigProvider : undefined);
  // Compare case-insensitively so `OpenAI`/`OPENAI` aren't treated as a custom provider.
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  return normalized.length > 0 && normalized !== 'openai';
}

/**
 * Whether the resolved API key should be presented to the Codex CLI/SDK across every channel
 * (the spawned process env, the SDK constructor `apiKey`, and `account/login`). Single source
 * of truth so the channels can never disagree: inject only when the key belongs to the active
 * backend — the default OpenAI provider, or a custom `model_provider` where the user set
 * `config.apiKey` explicitly.
 */
export function shouldInjectApiKey(
  config: CodexApiKeyGatingConfig,
  apiKey: string | undefined,
): boolean {
  return Boolean(apiKey) && (!usesCustomModelProvider(config) || Boolean(config.apiKey));
}

/**
 * Apply the resolved Codex/OpenAI API key to the spawned Codex CLI environment.
 *
 * Inject it only when {@link shouldInjectApiKey} allows (the key belongs to the active
 * backend). When routing to a non-OpenAI provider without an explicit key, an ambient
 * OPENAI_API_KEY / CODEX_API_KEY is unrelated to the backend; never inject one, and also strip
 * any inherited via `inherit_process_env` — unless the user passed it explicitly through
 * cli_env.
 */
export function applyApiKeyToCliEnv(
  sortedEnv: Record<string, string>,
  config: CodexApiKeyGatingConfig,
  apiKey: string | undefined,
): void {
  // The `apiKey &&` guard narrows `apiKey` to `string` for the assignments below;
  // `shouldInjectApiKey` already short-circuits on a falsy key.
  if (apiKey && shouldInjectApiKey(config, apiKey)) {
    sortedEnv.OPENAI_API_KEY = apiKey;
    sortedEnv.CODEX_API_KEY = apiKey;
    return;
  }
  if (usesCustomModelProvider(config)) {
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY'] as const) {
      if (!(key in (config.cli_env ?? {}))) {
        delete sortedEnv[key];
      }
    }
  }
}
