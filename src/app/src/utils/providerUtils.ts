/**
 * Checks if a test case is using a different provider than the default
 */
export const isProviderOverridden = (
  defaultProvider: string | { id: string } | undefined,
  testCaseProvider?: { modelName?: string; id?: string },
) => {
  const normalizedDefault = (
    typeof defaultProvider === 'string' ? defaultProvider : defaultProvider?.id
  )?.replace('openai:', '');

  const normalizedTest = testCaseProvider?.modelName;

  return Boolean(normalizedTest && normalizedDefault && normalizedTest !== normalizedDefault);
};
