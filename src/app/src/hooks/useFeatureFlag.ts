// Define all available feature flags
export const FEATURE_FLAGS = {
  EVAL_RESULTS_MULTI_FILTERING: 'FEATURE_ENABLED__EVAL_RESULTS_MULTI_FILTERING',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export const useFeatureFlag = (flag: FeatureFlag): boolean => {
  const flagKey = FEATURE_FLAGS[flag];
  // Now that we're passing actual booleans from vite.config.ts,
  // we can directly return the value with a fallback to false
  return import.meta.env[flagKey] ?? false;
};
