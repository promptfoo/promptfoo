// Define all available feature flags
export const FEATURE_FLAGS = {
  EVAL_RESULTS_MULTI_FILTERING: 'FEATURE_ENABLED__EVAL_RESULTS_MULTI_FILTERING',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export const useFeatureFlag = (flag: FeatureFlag): boolean => {
  const flagKey = FEATURE_FLAGS[flag];
  // Cast to boolean to ensure consistent return type
  return Boolean(import.meta.env[flagKey]);
};
