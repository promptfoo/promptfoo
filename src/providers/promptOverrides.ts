const FRAMEWORK_PROMPT_OPTION_KEYS = new Set([
  'prefix',
  'suffix',
  'postprocess',
  'transform',
  'transformVars',
  'storeOutputAs',
  'rubricPrompt',
  'provider',
  'factuality',
  'disableVarExpansion',
  'disableConversationVar',
  'disableDefaultAsserts',
  'runSerially',
  'repeat',
  'redteamGraderExamples',
]);

/** The evaluator merges test options into the prompt before providers validate per-turn overrides. */
export function getProviderPromptOverrides(config: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !FRAMEWORK_PROMPT_OPTION_KEYS.has(key)),
  );
}
