/**
 * Shared GPT-5.6 preview reasoning handling for the two Codex providers
 * (`openai:codex-sdk` and `openai:codex-app-server`). Both accept and forward these
 * reasoning-effort values, but they only take effect when the installed Codex runtime
 * recognizes the selected model; otherwise Codex silently falls back to its default
 * reasoning. Keeping the trigger set and the caveat message in one place stops the two
 * providers from drifting apart.
 */
import logger from '../../logger';

/** Reasoning-effort levels introduced by the GPT-5.6 limited preview. */
export const CODEX_PREVIEW_REASONING_EFFORTS = ['max', 'ultra'] as const;

/**
 * Warn when a GPT-5.6 preview reasoning effort (`max`/`ultra`) is configured on a Codex
 * provider. The Codex runtime drops the effort without raising an error when its bundled
 * model catalog lacks GPT-5.6, so surface a single, consistent breadcrumb for both providers.
 *
 * @param effort - The configured `model_reasoning_effort`, if any.
 * @param component - Log prefix identifying the caller, e.g. `[CodexSDK]`.
 */
export function warnIfPreviewReasoningEffort(effort: string | undefined, component: string): void {
  if (!effort || !(CODEX_PREVIEW_REASONING_EFFORTS as readonly string[]).includes(effort)) {
    return;
  }

  logger.warn(
    `${component} Reasoning effort '${effort}' is a GPT-5.6 preview level. It only takes effect ` +
      `when the installed Codex runtime recognizes the selected model for your account; if the ` +
      `runtime model catalog lacks GPT-5.6, Codex silently falls back to its default reasoning and ` +
      `this value is ignored (no error is raised). Confirm the effective reasoning via request ` +
      `tracing, or use the Responses API (openai:responses:gpt-5.6-sol) for 'max'.`,
  );
}
