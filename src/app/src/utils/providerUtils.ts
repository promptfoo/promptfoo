import type { ProviderOptions } from '@promptfoo/types';

/**
 * Checks if a test case is using a different provider than the default
 */
export const isProviderOverridden = (
  defaultProvider: string | ProviderOptions | undefined,
  testCaseProvider?: ProviderOptions,
) => {
  const normalizedDefault =
    typeof defaultProvider === 'string' ? defaultProvider : defaultProvider?.id;

  const normalizedTest = testCaseProvider?.id;

  return Boolean(normalizedTest && normalizedDefault && normalizedTest !== normalizedDefault);
};
