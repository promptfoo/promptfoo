import { describe, it, expect, vi } from 'vitest';
import { useFeatureFlag } from './useFeatureFlag';

describe('useFeatureFlag', () => {
  it.each([
    { description: 'environment variable value', flagValue: 'true' },
    { description: "environment variable set to 'true'", flagValue: 'true' },
    { description: "environment variable set to 'false'", flagValue: 'false' },
    { description: "string value '1'", flagValue: '1' },
    { description: "string value '0'", flagValue: '0' },
  ])('should return $flagValue when testing $description', ({ flagValue }) => {
    vi.stubEnv('FEATURE_ENABLED__EVAL_RESULTS_MULTI_FILTERING', flagValue);

    const result = useFeatureFlag('EVAL_RESULTS_MULTI_FILTERING');

    expect(result).toBe(flagValue);
  });

  it('should correctly construct the environment variable name even with an invalid flag name', () => {
    const invalidFlagName = 'INVALID_FLAG';
    const expectedEnvVarName = `FEATURE_ENABLED__${invalidFlagName}`;
    const flagValue = 'some_value';

    vi.stubEnv(expectedEnvVarName, flagValue);

    const result = useFeatureFlag(invalidFlagName as any);

    expect(result).toBe(flagValue);
  });
});
